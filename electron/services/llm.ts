import { getPreferences, getSecret, providerNeedsKey } from './secure-store'
import { invokeAgentCli } from './agent-cli'
import { runLocalInference } from './local-model'
import type { LlmMessage, LlmRequest, LlmResponse, ProviderId, StoredSecrets } from '../../src/shared/types'

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; keyField?: keyof StoredSecrets }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyField: 'openai' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514', keyField: 'anthropic' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyField: 'deepseek' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', keyField: 'google' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keyField: 'mistral' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyField: 'groq' },
}

function mockComplete(messages: LlmMessage[]): string {
  const user = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  const blob = messages.map((m) => m.content).join('\n')
  const isHumanize = /humaniz/i.test(blob)
  const isMutate = /propose file mutations|write\/edit\/delete|mutations:\s*\[/i.test(blob)
  const isReview = /code review|find bugs|security/i.test(blob)

  if (isHumanize) {
    const fenced = user.match(/```[\w]*\n?([\s\S]*?)```/)
    const source = (fenced?.[1] || user).trim()
    const humanized = source
      .replace(/\bgetUserData\b/g, 'loadProfile')
      .replace(/\bfetchData\b/g, 'pullRecords')
      .replace(/\bprocessItem\b/g, 'handleRow')
      .replace(/\bconst\s+([A-Z][A-Z0-9_]+)\b/g, (_m: string, name: string) => `const ${name.toLowerCase()}`)
      .replace(/\/\/\s*TODO:.*/g, '')
      .trim()
    return JSON.stringify({
      humanized: humanized || '// humanized snippet\nfunction loadProfile(id) {\n  return store.find(id);\n}\n',
      notes: [
        'Renamed generic AI-style identifiers to shorter domain verbs.',
        'Removed TODO noise and flattened overly descriptive names.',
        'Behavior preserved for the demonstrated transforms.',
      ],
    })
  }

  if (isMutate) {
    return JSON.stringify({
      mutations: [
        {
          kind: 'edit',
          path: 'snippet',
          rationale: 'Add a guard for empty input before processing.',
          after: '// proposed edit — confirm before apply\nif (!input) return null;\n',
        },
      ],
    })
  }

  return JSON.stringify({
    summary:
      isReview
        ? 'Mock review (no API key configured). Wire an OpenAI, Anthropic, DeepSeek, or local model key in Settings for live analysis.'
        : 'Mock response. Configure a live provider in Settings for production analysis.',
    findings: [
      {
        severity: 'medium',
        file: 'ingested',
        line: 1,
        title: 'Add input validation',
        detail: 'Public entry points should validate and normalize untrusted input.',
        suggestion: 'Reject empty or oversized payloads early and return a typed error.',
      },
      {
        severity: 'low',
        file: 'ingested',
        title: 'Document assumptions',
        detail: 'Complex helpers lack short comments describing invariants.',
        suggestion: 'Add one-line comments for non-obvious preconditions.',
      },
    ],
  })
}

async function openAiCompatible(
  provider: ProviderId,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${provider} API error ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return {
    content: data.choices?.[0]?.message?.content || '',
    provider,
    model,
    mocked: false,
  }
}

async function anthropicComplete(
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const converted = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: converted,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const content = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('\n')
  return { content, provider: 'anthropic', model, mocked: false }
}

async function googleComplete(
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
): Promise<LlmResponse> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google API error ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  return { content, provider: 'google', model, mocked: false }
}

export async function completeLlm(req: Partial<LlmRequest> & { messages: LlmMessage[] }): Promise<LlmResponse> {
  const prefs = getPreferences().provider
  const provider = (req.provider || prefs.activeProvider) as ProviderId
  const model = req.model || prefs.model
  const temperature = req.temperature ?? prefs.temperature
  const maxTokens = req.maxTokens ?? prefs.maxTokens

  if (provider === 'mock') {
    return { content: mockComplete(req.messages), provider, model: 'mock-heuristic', mocked: true }
  }

  if (provider === 'cursor-cli' || provider === 'claude-code' || provider === 'codex') {
    return invokeAgentCli(provider, req.messages)
  }

  if (provider === 'ollama') {
    return runLocalInference('ollama', prefs.local, req.messages)
  }
  if (provider === 'llamacpp') {
    return runLocalInference('llamacpp', prefs.local, req.messages)
  }

  if (providerNeedsKey(provider)) {
    const meta = PROVIDER_DEFAULTS[provider]
    const keyField = meta?.keyField
    const apiKey = keyField ? await getSecret(keyField) : undefined
    if (!apiKey) {
      // Graceful mock fallback so the app stays usable without keys
      return {
        content: mockComplete(req.messages),
        provider: 'mock',
        model: 'mock-no-key',
        mocked: true,
      }
    }
    if (provider === 'anthropic') {
      return anthropicComplete(apiKey, model || meta.model, req.messages, temperature, maxTokens)
    }
    if (provider === 'google') {
      return googleComplete(apiKey, model || meta.model, req.messages, temperature, maxTokens)
    }
    return openAiCompatible(
      provider,
      meta.baseUrl,
      apiKey,
      model || meta.model,
      req.messages,
      temperature,
      maxTokens,
    )
  }

  throw new Error(`Unsupported provider: ${provider}`)
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced?.[1] || text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  }
  throw new Error('Model response did not contain JSON')
}
