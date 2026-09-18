import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'
import { createRequire } from 'node:module'
import { cpus, homedir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import Store from 'electron-store'
import type { LocalModelSettings, ProviderId, ProviderSettings, StoredSecrets } from '../../src/shared/types'

const SERVICE = 'code-review-assistant'
const ACCOUNT = 'api-secrets'
const MACHINE_KEY_FILE = path.join(homedir(), '.code-review-assistant', 'machine.key')
const require = createRequire(import.meta.url)

type Preferences = {
  provider: ProviderSettings
  theme: 'system' | 'light' | 'dark'
  lastWorkspaceId?: string
}

const defaultLocal: LocalModelSettings = {
  backend: 'auto',
  gpuLayers: 20,
  cpuThreads: Math.max(2, Math.min(8, cpus().length - 1 || 2)),
  contextSize: 4096,
  maxConcurrent: 1,
  modelPath: '',
  llamaCppBin: process.env.LLAMA_CPP_BIN || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
}

const defaults: Preferences = {
  provider: {
    activeProvider: 'mock',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 4096,
    local: defaultLocal,
  },
  theme: 'system',
}

const store = new Store<Preferences>({
  name: 'preferences',
  // electron-store types omit projectName; required when running outside Electron (smoke tests)
  ...({ projectName: 'code-review-assistant' } as object),
  defaults,
})

function ensureMachineKey(): Buffer {
  const dir = path.dirname(MACHINE_KEY_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(MACHINE_KEY_FILE)) {
    const key = randomBytes(32)
    fs.writeFileSync(MACHINE_KEY_FILE, key, { mode: 0o600 })
    return key
  }
  return fs.readFileSync(MACHINE_KEY_FILE)
}

function encryptJson(value: unknown): string {
  const key = scryptSync(ensureMachineKey(), 'cra-salt-v1', 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decryptJson<T>(payload: string): T {
  const raw = Buffer.from(payload, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const data = raw.subarray(28)
  const key = scryptSync(ensureMachineKey(), 'cra-salt-v1', 32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(dec.toString('utf8')) as T
}

type KeytarMod = {
  getPassword: (service: string, account: string) => Promise<string | null>
  setPassword: (service: string, account: string, password: string) => Promise<void>
  deletePassword: (service: string, account: string) => Promise<boolean>
}

function tryKeytar(): KeytarMod | null {
  try {
    // Runtime-only native load — keep the module id out of the Vite graph
    const id = ['key', 'tar'].join('')
    return require(id) as KeytarMod
  } catch {
    return null
  }
}

const fallbackSecretsPath = path.join(homedir(), '.code-review-assistant', 'secrets.enc')

export async function loadSecrets(): Promise<StoredSecrets> {
  const keytar = tryKeytar()
  if (keytar) {
    try {
      const raw = await keytar.getPassword(SERVICE, ACCOUNT)
      if (!raw) return {}
      try {
        return JSON.parse(raw) as StoredSecrets
      } catch {
        return {}
      }
    } catch {
      // OS keychain unavailable (headless / disabled dbus) — fall through to encrypted file
    }
  }
  if (!fs.existsSync(fallbackSecretsPath)) return {}
  try {
    return decryptJson<StoredSecrets>(fs.readFileSync(fallbackSecretsPath, 'utf8'))
  } catch {
    return {}
  }
}

export async function saveSecrets(secrets: StoredSecrets): Promise<void> {
  const cleaned: StoredSecrets = {}
  for (const [k, v] of Object.entries(secrets) as [keyof StoredSecrets, string | undefined][]) {
    if (v && v.trim()) cleaned[k] = v.trim()
  }
  const keytar = tryKeytar()
  if (keytar) {
    try {
      if (Object.keys(cleaned).length === 0) {
        try {
          await keytar.deletePassword(SERVICE, ACCOUNT)
        } catch {
          /* empty */
        }
      } else {
        await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(cleaned))
      }
      return
    } catch {
      // fall through to encrypted file vault
    }
  }
  const dir = path.dirname(fallbackSecretsPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (Object.keys(cleaned).length === 0) {
    if (fs.existsSync(fallbackSecretsPath)) fs.unlinkSync(fallbackSecretsPath)
    return
  }
  fs.writeFileSync(fallbackSecretsPath, encryptJson(cleaned), { mode: 0o600 })
}

export async function getSecret(provider: keyof StoredSecrets): Promise<string | undefined> {
  const envMap: Record<keyof StoredSecrets, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    groq: process.env.GROQ_API_KEY,
    github: process.env.GITHUB_TOKEN,
  }
  if (envMap[provider]) return envMap[provider]
  const all = await loadSecrets()
  return all[provider]
}

export function getPreferences(): Preferences {
  return {
    provider: store.get('provider'),
    theme: store.get('theme'),
    lastWorkspaceId: store.get('lastWorkspaceId'),
  }
}

export function setProviderSettings(settings: ProviderSettings): ProviderSettings {
  store.set('provider', settings)
  return settings
}

export function setTheme(theme: Preferences['theme']): void {
  store.set('theme', theme)
}

export function secretsFingerprint(secrets: StoredSecrets): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const key of Object.keys(secrets) as (keyof StoredSecrets)[]) {
    out[key] = Boolean(secrets[key])
  }
  return out
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function providerNeedsKey(provider: ProviderId): boolean {
  return ['openai', 'anthropic', 'deepseek', 'google', 'mistral', 'groq'].includes(provider)
}
