import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_LANGUAGES } from '../electron/lib/languages.ts'
import { ingestFolder, ingestPaste } from '../electron/services/ingest.ts'
import { applyMutation } from '../electron/services/mutate.ts'
import { proposeMutations, runCodeReview, runHumanize } from '../electron/services/review.ts'
import type { ProposedMutation } from '../src/shared/types.ts'

const root = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('languages', SUPPORTED_LANGUAGES.length)
  if (SUPPORTED_LANGUAGES.length < 10) throw new Error('expected >=10 languages')

  const ws = await ingestPaste('function getUserData(id){return id}', 'javascript', 'a.js')
  console.log('paste', ws.files.length, ws.files[0].language)

  const folder = await ingestFolder(path.resolve(root, '../fixtures/sample-project'))
  console.log(
    'folder',
    folder.workspace.files.map((f) => f.relativePath),
    'skipped',
    folder.skipped.length,
  )
  if (folder.workspace.files.length < 2) throw new Error('expected sample fixtures')

  const review = await runCodeReview(ws)
  console.log('review', review.findings.length, review.provider)

  const human = await runHumanize(ws.files[0])
  console.log('humanize', human.notes.length, human.humanized.slice(0, 80).replace(/\n/g, ' '))

  const muts = await proposeMutations(ws, 'Add a null guard')
  console.log('mutations', muts.length, muts[0]?.kind)
  if (!muts[0]) throw new Error('expected at least one mutation proposal')

  const denied = await applyMutation(ws, muts[0], false)
  if (denied.ok) throw new Error('mutation must require confirmation')
  console.log('deny-without-confirm', denied.error)

  const pasteMut: ProposedMutation = {
    ...muts[0],
    kind: 'edit',
    path: 'a.js',
    after: 'function getUserData(id){ if(!id) return null; return id }',
  }
  const applied = await applyMutation(ws, pasteMut, true)
  console.log('apply-paste', applied.ok)

  console.log('SMOKE_OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
