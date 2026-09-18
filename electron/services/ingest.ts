import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import fg from 'fast-glob'
import ignore from 'ignore'
import {
  BINARY_EXTENSIONS,
  DEFAULT_IGNORE,
  EXT_TO_LANGUAGE,
  MAX_FILE_BYTES,
  MAX_FILES,
} from '../lib/languages'
import type { CodeFile, FolderIngestResult, LanguageId, WorkspaceSnapshot } from '../../src/shared/types'

function detectLanguage(filePath: string): LanguageId {
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_LANGUAGE[ext] ?? 'plaintext'
}

function isProbablyBinary(filePath: string, sample: Buffer): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return true
  if (sample.includes(0)) return true
  return false
}

async function readTextFile(filePath: string): Promise<string | null> {
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
  const handle = await fs.open(filePath, 'r')
  try {
    const sample = Buffer.alloc(Math.min(4096, stat.size))
    await handle.read(sample, 0, sample.length, 0)
    if (isProbablyBinary(filePath, sample)) return null
  } finally {
    await handle.close()
  }
  return fs.readFile(filePath, 'utf8')
}

export async function ingestFolder(rootPath: string, name?: string): Promise<FolderIngestResult> {
  const ig = ignore().add(DEFAULT_IGNORE)
  const entries = await fg('**/*', {
    cwd: rootPath,
    onlyFiles: true,
    dot: false,
    absolute: false,
    followSymbolicLinks: false,
    suppressErrors: true,
  })

  const skipped: string[] = []
  const files: CodeFile[] = []

  for (const rel of entries) {
    if (ig.ignores(rel)) {
      skipped.push(rel)
      continue
    }
    if (files.length >= MAX_FILES) {
      skipped.push(rel)
      continue
    }
    const abs = path.join(rootPath, rel)
    try {
      const content = await readTextFile(abs)
      if (content === null) {
        skipped.push(rel)
        continue
      }
      files.push({
        id: randomUUID(),
        path: abs,
        relativePath: rel.replace(/\\/g, '/'),
        language: detectLanguage(rel),
        content,
        size: Buffer.byteLength(content, 'utf8'),
      })
    } catch {
      skipped.push(rel)
    }
  }

  const workspace: WorkspaceSnapshot = {
    id: randomUUID(),
    kind: 'folder',
    name: name || path.basename(rootPath),
    rootPath,
    files,
    createdAt: new Date().toISOString(),
  }

  return { workspace, skipped }
}

export async function ingestPaste(
  content: string,
  language: LanguageId = 'plaintext',
  fileName = 'snippet.txt',
  existing?: WorkspaceSnapshot | null,
): Promise<WorkspaceSnapshot> {
  const file: CodeFile = {
    id: randomUUID(),
    path: fileName,
    relativePath: fileName,
    language,
    content,
    size: Buffer.byteLength(content, 'utf8'),
  }
  if (existing && existing.kind === 'paste') {
    // Avoid name collisions
    let rel = fileName
    let n = 2
    const used = new Set(existing.files.map((f) => f.relativePath))
    while (used.has(rel)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      rel = `${base}-${n}${ext}`
      n += 1
    }
    file.relativePath = rel
    file.path = rel
    return {
      ...existing,
      files: [...existing.files, file],
      name: existing.files.length ? `pastes (${existing.files.length + 1})` : rel,
    }
  }
  return {
    id: randomUUID(),
    kind: 'paste',
    name: fileName,
    files: [file],
    createdAt: new Date().toISOString(),
  }
}

export async function writeFileConfirmed(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

export async function deleteFileConfirmed(filePath: string): Promise<void> {
  await fs.unlink(filePath)
}

export async function readFileSafe(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

/** Stream probe used only to avoid loading huge binaries into memory. */
export function probeReadable(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { start: 0, end: 512 })
    const chunks: Buffer[] = []
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    stream.on('error', () => resolve(false))
    stream.on('end', () => {
      const buf = Buffer.concat(chunks)
      resolve(!isProbablyBinary(filePath, buf))
    })
  })
}
