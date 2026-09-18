import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_LANGUAGES } from '../electron/lib/languages.ts'
import { ingestFolder, ingestPaste } from '../electron/services/ingest.ts'
import { applyMutation } from '../electron/services/mutate.ts'
import { runHumanizeForFiles, runReviewsForFiles } from '../electron/services/review.ts'
import { MAX_SELECTED_FILES, type ProposedMutation } from '../src/shared/types.ts'

const root = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('languages', SUPPORTED_LANGUAGES.length)
  if (SUPPORTED_LANGUAGES.length < 10) throw new Error('expected >=10 languages')
  if (MAX_SELECTED_FILES !== 5) throw new Error('expected max 5 selected files')

  let ws = await ingestPaste('function getUserData(id){return id}', 'javascript', 'a.js')
  ws = await ingestPaste('print("hello")', 'python', 'b.py', ws)
  console.log('paste-append', ws.files.length, ws.files.map((f) => f.relativePath).join(','))
  if (ws.files.length !== 2) throw new Error('expected paste append to keep both files')

  const folder = await ingestFolder(path.resolve(root, '../fixtures/sample-project'))
  const rootName = folder.workspace.name
  const prefixed = {
    ...folder.workspace,
    files: folder.workspace.files.map((f) => ({
      ...f,
      relativePath: f.relativePath.startsWith(`${rootName}/`)
        ? f.relativePath
        : `${rootName}/${f.relativePath}`,
    })),
  }
  console.log(
    'folder-tree',
    prefixed.files.map((f) => f.relativePath),
    'skipped',
    folder.skipped.length,
  )
  if (prefixed.files.length < 2) throw new Error('expected sample fixtures')
  if (!prefixed.files.every((f) => f.relativePath.startsWith(`${rootName}/`))) {
    throw new Error('folder files should sit under repo/folder name')
  }

  // Without API keys, per-file jobs return error payloads (no offline mock).
  const reviews = await runReviewsForFiles(ws.files.slice(0, MAX_SELECTED_FILES))
  console.log(
    'reviews',
    reviews.length,
    reviews.map((r) => (r.error ? 'err' : 'ok')).join(','),
  )
  if (reviews.length !== 2) throw new Error('expected one review result per file')

  const humans = await runHumanizeForFiles(ws.files.slice(0, MAX_SELECTED_FILES))
  console.log('humanize', humans.length)
  if (humans.length !== 2) throw new Error('expected one humanize result per file')

  const pasteMut: ProposedMutation = {
    id: 'smoke-edit',
    kind: 'edit',
    path: 'a.js',
    before: ws.files[0].content,
    after: 'function getUserData(id){ if(!id) return null; return id }',
    rationale: 'Add null guard',
    confirmed: false,
    applied: false,
  }
  const denied = await applyMutation(ws, pasteMut, false)
  if (denied.ok) throw new Error('mutation must require confirmation')
  console.log('deny-without-confirm', denied.error)

  const applied = await applyMutation(ws, { ...pasteMut, confirmed: true }, true)
  console.log('apply-paste', applied.ok)
  if (!applied.ok) throw new Error(applied.error || 'apply failed')

  console.log('SMOKE_OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
