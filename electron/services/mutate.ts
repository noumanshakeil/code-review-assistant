import path from 'node:path'
import { deleteFileConfirmed, writeFileConfirmed } from './ingest'
import type { ProposedMutation, WorkspaceSnapshot } from '../../src/shared/types'

export interface ApplyResult {
  mutation: ProposedMutation
  ok: boolean
  error?: string
}

export async function applyMutation(
  workspace: WorkspaceSnapshot,
  mutation: ProposedMutation,
  confirmed: boolean,
): Promise<ApplyResult> {
  if (!confirmed) {
    return { mutation, ok: false, error: 'User confirmation required before applying mutations.' }
  }
  if (mutation.applied) {
    return { mutation, ok: false, error: 'Mutation already applied.' }
  }

  const abs =
    workspace.rootPath && !path.isAbsolute(mutation.path)
      ? path.join(workspace.rootPath, mutation.path)
      : mutation.path

  try {
    if (mutation.kind === 'delete') {
      if (!workspace.rootPath && workspace.kind === 'paste') {
        return { mutation, ok: false, error: 'Cannot delete paste-only snippets on disk.' }
      }
      await deleteFileConfirmed(abs)
    } else {
      if (mutation.after === undefined) {
        return { mutation, ok: false, error: 'Missing file contents for write/edit.' }
      }
      if (!workspace.rootPath && workspace.kind === 'paste') {
        // In-memory paste workspace: mark applied; renderer updates buffer
        return {
          mutation: { ...mutation, confirmed: true, applied: true },
          ok: true,
        }
      }
      await writeFileConfirmed(abs, mutation.after)
    }
    return { mutation: { ...mutation, confirmed: true, applied: true }, ok: true }
  } catch (err) {
    return {
      mutation,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
