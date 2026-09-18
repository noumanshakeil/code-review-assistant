import { randomUUID } from 'node:crypto'
import { completeLlm, extractJson } from './llm'
import type {
  CodeFile,
  HumanizeResult,
  LanguageId,
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

function isProseHeavy(workspace: WorkspaceSnapshot): boolean {
  const files = workspace.files
  if (files.length === 0) return false
  const proseLangs = new Set<LanguageId>(['plaintext', 'markdown', 'html'])
  const proseCount = files.filter((f) => proseLangs.has(f.language)).length
  if (proseCount === files.length) return true
  // Heuristic: little code punctuation relative to letters
  const sample = files.map((f) => f.content).join('\n').slice(0, 4000)
  const codey = (sample.match(/[{};=<>]|function\s|def\s|class\s|import\s|#include/g) || []).length
  const words = (sample.match(/[A-Za-z]{3,}/g) || []).length
  return words > 40 && codey < 3
}

export async function runCodeReview(workspace: WorkspaceSnapshot): Promise<ReviewResult> {
  const packed = packFiles(workspace.files)
  const prose = isProseHeavy(workspace)
  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content: prose
          ? `You are an expert editor reviewing natural-language / plaintext / markdown content (not source code).
The user intentionally pasted prose — NEVER say there is "no code to review" or that nothing was pasted.
Return ONLY JSON with keys summary (string) and findings (array of {severity,file,line?,title,detail,suggestion?}).
Severities: critical|high|medium|low|info.
Cover clarity, tone, grammar, structure, persuasiveness, factuality risks, and AI-sounding phrasing. Be concrete and quote short phrases when helpful.`
          : `You are a senior code review assistant.
If a file is clearly natural-language prose (plaintext/markdown with no code), review it as writing (clarity, tone, structure) instead of claiming there is nothing to review.
Return ONLY JSON with keys summary (string) and findings (array of {severity,file,line?,title,detail,suggestion?}).
Severities: critical|high|medium|low|info. Be concrete and actionable.`,
      },
      {
        role: 'user',
        content: prose
          ? `Perform a writing / content review for workspace "${workspace.name}" (${workspace.files.length} file(s)). The content was pasted on purpose.\n\n${packed}`
          : `Perform a review for workspace "${workspace.name}" (${workspace.files.length} files).\n\n${packed}`,
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

  // Soft-rewrite unhelpful "no code" dismissals if the model still does that
  if (
    prose &&
    /no code|does not contain any source code|nothing was pasted|no programming constructs/i.test(parsed.summary)
  ) {
    parsed.summary =
      'Writing review of your pasted plaintext. Focus on clarity, tone, and structure rather than code defects.'
  }
  if (prose) {
    parsed.findings = (parsed.findings || []).filter(
      (f) => !/no code to review|does not contain any source code/i.test(`${f.title} ${f.detail}`),
    )
    if (parsed.findings.length === 0) {
      parsed.findings = [
        {
          severity: 'info',
          file: workspace.files[0]?.relativePath || 'snippet',
          line: 1,
          title: 'Content received — review as prose',
          detail:
            'Your paste was ingested successfully. Ask the model again or switch provider if findings are empty; the workspace contains plaintext for writing review.',
          suggestion: 'Re-run Review, or use Humanize to rewrite the prose in a more natural voice.',
        },
      ]
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
  const prose = file.language === 'plaintext' || file.language === 'markdown' || file.language === 'html'
  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content: prose
          ? `You rewrite natural-language text so it sounds more human and less AI-generated, while keeping the same meaning and facts.
Vary sentence length, prefer concrete wording, avoid buzzword stacks and generic marketing filler.
Return ONLY JSON: { humanized: string, notes: string[] }.`
          : `You humanize source code to reduce common AI-detection heuristics while preserving behavior. Rename overly generic identifiers, vary sentence-like comments, simplify verbose helpers, keep semantics equivalent. Return ONLY JSON: { humanized: string, notes: string[] }.`,
      },
      {
        role: 'user',
        content: prose
          ? `Humanize this ${file.language} writing (${file.relativePath}). Do not claim the input is empty.\n\n---\n${file.content}\n---`
          : `Humanize this ${file.language} file (${file.relativePath}):\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``,
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
