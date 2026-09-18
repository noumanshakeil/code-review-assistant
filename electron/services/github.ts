import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import { ingestFolder } from './ingest'
import type { CloneRequest, FolderIngestResult } from '../../src/shared/types'
import { getSecret } from './secure-store'

function normalizeGithubUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, '')
  if (/^https?:\/\//i.test(trimmed) || /^git@/i.test(trimmed)) return trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return `https://github.com/${trimmed}.git`
  return trimmed
}

function withToken(url: string, token?: string): string {
  if (!token) return url
  try {
    const u = new URL(url)
    if (u.hostname.includes('github.com')) {
      u.username = token
      u.password = 'x-oauth-basic'
      return u.toString()
    }
  } catch {
    /* fall through */
  }
  return url
}

export async function cloneGithubRepo(req: CloneRequest): Promise<FolderIngestResult> {
  const token = req.token || (await getSecret('github'))
  const source = normalizeGithubUrl(req.url)
  const authenticated = withToken(source, token)
  const target = path.join(os.tmpdir(), 'cra-clones', `repo-${Date.now()}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })

  const git = simpleGit()
  try {
    await git.clone(authenticated, target, {
      '--depth': String(req.depth ?? 1),
      '--single-branch': null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/Authentication failed|could not read Username|403|401/i.test(message)) {
      throw new Error(
        'Clone failed: authentication required. Paste a GitHub token on the Clone screen for private repositories.',
      )
    }
    throw new Error(`Clone failed: ${message}`)
  }

  const name = path.basename(source.replace(/\.git$/, ''))
  const result = await ingestFolder(target, name)
  result.workspace.kind = 'github'
  result.workspace.githubUrl = source.replace(/\.git$/, '')
  // Nest all paths under the repo folder name for the tree UI
  result.workspace.files = result.workspace.files.map((f) => ({
    ...f,
    relativePath: `${name}/${f.relativePath}`.replace(/\/+/g, '/'),
  }))
  return result
}
