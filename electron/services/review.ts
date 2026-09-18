import { randomUUID } from 'node:crypto'
import { completeLlm, extractJson } from './llm'
import type {
  CodeFile,
  HumanizeResult,
  ProposedMutation,
  ReviewFinding,
  ReviewResult,
  WorkspaceSnapshot,
} from '../../src/shared/types'

function packFiles(files: CodeFile[], limit = 40_000): string {
  let used = 0
  const parts: string[] = []
  for (const f of files) {
    const chunk = `--- ${f.relativePath} (${f.language}) ---\n${f.content}\n`
    if (used + chunk.length > limit) break
    parts.push(chunk)
    used += chunk.length
  }
  return parts.join('\n')
}

export async function runCodeReview(workspace: WorkspaceSnapshot): Promise<ReviewResult> {
  const packed = packFiles(workspace.files)
  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content:
          'You are a senior code review assistant. Return ONLY JSON with keys summary (string) and findings (array of {severity,file,line?,title,detail,suggestion?}). Severities: critical|high|medium|low|info. Be concrete and actionable.',
      },
      {
        role: 'user',
        content: `Perform a code review for workspace "${workspace.name}" (${workspace.files.length} files).\n\n${packed}`,
      },
    ],
  })

  let parsed: { summary: string; findings: Omit<ReviewFinding, 'id'>[] }
  try {
    parsed = extractJson(response.content)
  } catch {
    parsed = {
      summary: response.content.slice(0, 1200) || 'Review completed.',
      findings: [],
    }
  }

  return {
    id: randomUUID(),
    summary: parsed.summary,
    findings: (parsed.findings || []).map((f) => ({ ...f, id: randomUUID() })),
    provider: response.provider,
    model: response.model,
    createdAt: new Date().toISOString(),
  }
}

export async function runHumanize(file: CodeFile): Promise<HumanizeResult> {
  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content:
          'You humanize source code to reduce common AI-detection heuristics while preserving behavior. Rename overly generic identifiers, vary sentence-like comments, simplify verbose helpers, keep semantics equivalent. Return ONLY JSON: { humanized: string, notes: string[] }.',
      },
      {
        role: 'user',
        content: `Humanize this ${file.language} file (${file.relativePath}):\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``,
      },
    ],
  })

  let parsed: { humanized: string; notes: string[] }
  try {
    parsed = extractJson(response.content)
  } catch {
    parsed = { humanized: response.content, notes: ['Returned raw model text'] }
  }

  return {
    id: randomUUID(),
    filePath: file.relativePath,
    original: file.content,
    humanized: parsed.humanized,
    notes: parsed.notes || [],
    provider: response.provider,
    model: response.model,
  }
}

export async function proposeMutations(
  workspace: WorkspaceSnapshot,
  instruction: string,
): Promise<ProposedMutation[]> {
  const packed = packFiles(workspace.files, 30_000)
  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content:
          'You propose file mutations for a coding assistant. Never claim changes were applied. Return ONLY JSON: { mutations: [{ kind: "write"|"edit"|"delete", path: string, after?: string, rationale: string }] }. Paths are workspace-relative. For delete, omit after. For write/edit, include full file contents in after.',
      },
      {
        role: 'user',
        content: `Workspace "${workspace.name}". User instruction:\n${instruction}\n\nFiles:\n${packed}`,
      },
    ],
  })

  let parsed: { mutations: { kind: ProposedMutation['kind']; path: string; after?: string; rationale: string }[] }
  try {
    parsed = extractJson(response.content)
  } catch {
    parsed = { mutations: [] }
  }

  return (parsed.mutations || []).map((m) => {
    const existing = workspace.files.find((f) => f.relativePath === m.path || f.path === m.path)
    return {
      id: randomUUID(),
      kind: m.kind,
      path: m.path,
      before: existing?.content,
      after: m.after,
      rationale: m.rationale,
      confirmed: false,
      applied: false,
    }
  })
}
