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

const FILE_CONCURRENCY = 3

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, () => worker())
  await Promise.all(workers)
  return results
}

function isProseFile(file: CodeFile): boolean {
  const proseLangs = new Set<LanguageId>(['plaintext', 'markdown', 'html'])
  if (proseLangs.has(file.language)) return true
  const sample = file.content.slice(0, 4000)
  const codey = (sample.match(/[{};=<>]|function\s|def\s|class\s|import\s|#include/g) || []).length
  const words = (sample.match(/[A-Za-z]{3,}/g) || []).length
  return words > 40 && codey < 3
}

export async function runFileReview(file: CodeFile): Promise<ReviewResult> {
  const prose = isProseFile(file)
  try {
    const response = await completeLlm({
      messages: [
        {
          role: 'system',
          content: prose
            ? `You are an expert editor reviewing natural-language content.
NEVER say there is "no code to review" or that nothing was pasted.
Return ONLY JSON with keys summary (string) and findings (array of {severity,file,line?,title,detail,suggestion?}).
Severities: critical|high|medium|low|info.
Cover clarity, tone, grammar, structure, and AI-sounding phrasing.`
            : `You are a senior code review assistant.
If the file is prose, review writing quality instead of claiming there is nothing to review.
Return ONLY JSON with keys summary (string) and findings (array of {severity,file,line?,title,detail,suggestion?}).
Severities: critical|high|medium|low|info.`,
        },
        {
          role: 'user',
          content: prose
            ? `Writing review for ${file.relativePath}:\n\n${file.content}`
            : `Code review for ${file.relativePath} (${file.language}):\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``,
        },
      ],
    })

    let parsed: { summary: string; findings: Omit<ReviewFinding, 'id'>[] }
    try {
      parsed = extractJson(response.content)
    } catch {
      parsed = { summary: response.content.slice(0, 1200) || 'Review completed.', findings: [] }
    }

    return {
      id: randomUUID(),
      fileId: file.id,
      filePath: file.relativePath,
      summary: parsed.summary,
      findings: (parsed.findings || []).map((f) => ({
        ...f,
        id: randomUUID(),
        file: f.file || file.relativePath,
      })),
      provider: response.provider,
      model: response.model,
      createdAt: new Date().toISOString(),
    }
  } catch (err) {
    return {
      id: randomUUID(),
      fileId: file.id,
      filePath: file.relativePath,
      summary: '',
      findings: [],
      provider: 'openai',
      model: '',
      createdAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runCodeReview(workspace: WorkspaceSnapshot): Promise<ReviewResult> {
  const file = workspace.files[0]
  if (!file) {
    return {
      id: randomUUID(),
      fileId: '',
      filePath: '',
      summary: 'No files to review.',
      findings: [],
      provider: 'openai',
      model: '',
      createdAt: new Date().toISOString(),
      error: 'No files',
    }
  }
  return runFileReview(file)
}

export async function runReviewsForFiles(files: CodeFile[]): Promise<ReviewResult[]> {
  return mapPool(files, FILE_CONCURRENCY, (f) => runFileReview(f))
}

export async function runHumanize(file: CodeFile): Promise<HumanizeResult> {
  const prose = isProseFile(file)
  try {
    const response = await completeLlm({
      messages: [
        {
          role: 'system',
          content: prose
            ? `Rewrite natural-language text so it sounds more human and less AI-generated, keeping the same meaning.
Return ONLY JSON: { humanized: string, notes: string[] }.`
            : `Humanize source code to reduce common AI-detection heuristics while preserving behavior.
Return ONLY JSON: { humanized: string, notes: string[] }.`,
        },
        {
          role: 'user',
          content: prose
            ? `Humanize this writing (${file.relativePath}):\n\n---\n${file.content}\n---`
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
      fileId: file.id,
      filePath: file.relativePath,
      original: file.content,
      humanized: parsed.humanized,
      notes: parsed.notes || [],
      provider: response.provider,
      model: response.model,
    }
  } catch (err) {
    return {
      id: randomUUID(),
      fileId: file.id,
      filePath: file.relativePath,
      original: file.content,
      humanized: file.content,
      notes: [],
      provider: 'openai',
      model: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runHumanizeForFiles(files: CodeFile[]): Promise<HumanizeResult[]> {
  return mapPool(files, FILE_CONCURRENCY, (f) => runHumanize(f))
}

export async function proposeMutations(
  workspace: WorkspaceSnapshot,
  instruction: string,
  files?: CodeFile[],
): Promise<ProposedMutation[]> {
  const target = files?.length ? files : workspace.files.slice(0, 5)
  const packed = target
    .map((f) => `--- ${f.relativePath} (${f.language}) ---\n${f.content}`)
    .join('\n\n')
    .slice(0, 30_000)

  const response = await completeLlm({
    messages: [
      {
        role: 'system',
        content:
          'You propose file mutations. Never claim changes were applied. Return ONLY JSON: { mutations: [{ kind: "write"|"edit"|"delete", path: string, after?: string, rationale: string }] }. Paths must match given relative paths. For write/edit include full file contents in after.',
      },
      {
        role: 'user',
        content: `Workspace "${workspace.name}". Instruction:\n${instruction}\n\nFiles:\n${packed}`,
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
