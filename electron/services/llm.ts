import { getPreferences, getSecret } from './secure-store'
import type { LlmMessage, LlmRequest, LlmResponse, ProviderId, StoredSecrets } from '../../src/shared/types'

const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { baseUrl: string; model: string; keyField: keyof StoredSecrets; fallbackModels: string[] }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyField: 'openai',
    fallbackModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    keyField: 'anthropic',
    fallbackModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
    ],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyField: 'deepseek',
    fallbackModels: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-pro'],
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    keyField: 'google',
    fallbackModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    keyField: 'mistral',
    fallbackModels: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyField: 'groq',
    fallbackModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
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
  const meta = PROVIDER_DEFAULTS[provider]
  if (!meta) throw new Error(`Unsupported provider: ${provider}`)

  const model = req.model || prefs.model || meta.model
  const temperature = req.temperature ?? prefs.temperature
  const maxTokens = req.maxTokens ?? prefs.maxTokens
  const apiKey = await getSecret(meta.keyField)
  if (!apiKey) {
    throw new Error(`Add your ${provider} API key in Models & keys before running AI features.`)
  }

  if (provider === 'anthropic') {
    return anthropicComplete(apiKey, model, req.messages, temperature, maxTokens)
  }
  if (provider === 'google') {
    return googleComplete(apiKey, model, req.messages, temperature, maxTokens)
  }
  return openAiCompatible(provider, meta.baseUrl, apiKey, model, req.messages, temperature, maxTokens)
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

export async function listProviderModels(provider: ProviderId): Promise<string[]> {
  const meta = PROVIDER_DEFAULTS[provider]
  const apiKey = await getSecret(meta.keyField)
  if (!apiKey) return meta.fallbackModels

  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (!res.ok) return meta.fallbackModels
      const data = (await res.json()) as { data?: { id: string }[] }
      const ids = (data.data || []).map((m) => m.id).filter(Boolean)
      return ids.length ? ids : meta.fallbackModels
    }
    if (provider === 'google') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      )
      if (!res.ok) return meta.fallbackModels
      const data = (await res.json()) as { models?: { name: string }[] }
      const ids = (data.models || [])
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((id) => /gemini/i.test(id))
      return ids.length ? ids : meta.fallbackModels
    }
    const res = await fetch(`${meta.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return meta.fallbackModels
    const data = (await res.json()) as { data?: { id: string }[] }
    let ids = (data.data || []).map((m) => m.id).filter(Boolean)
    if (provider === 'openai') {
      ids = ids.filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id))
    }
    if (provider === 'deepseek') {
      ids = ids.filter((id) => /deepseek/i.test(id))
    }
    return ids.length ? ids.sort() : meta.fallbackModels
  } catch {
    return meta.fallbackModels
  }
}

export function defaultModelFor(provider: ProviderId): string {
  return PROVIDER_DEFAULTS[provider].model
}
