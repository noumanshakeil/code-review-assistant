import { homedir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import Store from 'electron-store'
import type { ProviderId, ProviderSettings, StoredSecrets } from '../../src/shared/types'

const SERVICE = 'code-review-assistant'
const ACCOUNT = 'api-secrets'
const MACHINE_KEY_FILE = path.join(homedir(), '.code-review-assistant', 'machine.key')
const require = createRequire(import.meta.url)

type Preferences = {
  provider: ProviderSettings
  theme: 'system' | 'light' | 'dark'
  setupComplete?: boolean
}

const defaults: Preferences = {
  provider: {
    activeProvider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 4096,
  },
  theme: 'system',
  setupComplete: false,
}

const store = new Store<Preferences>({
  name: 'preferences',
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
      /* fall through */
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
      /* fall through */
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
  const provider = store.get('provider')
  // Migrate legacy shapes
  const normalized: ProviderSettings = {
    activeProvider: (['openai', 'anthropic', 'deepseek', 'google', 'mistral', 'groq'].includes(
      provider?.activeProvider as string,
    )
      ? provider.activeProvider
      : 'openai') as ProviderId,
    model: provider?.model || 'gpt-4o-mini',
    temperature: provider?.temperature ?? 0.2,
    maxTokens: provider?.maxTokens ?? 4096,
  }
  return {
    provider: normalized,
    theme: store.get('theme') || 'system',
    setupComplete: store.get('setupComplete') ?? false,
  }
}

export function setProviderSettings(settings: ProviderSettings): ProviderSettings {
  store.set('provider', settings)
  return settings
}

export function setSetupComplete(done: boolean): void {
  store.set('setupComplete', done)
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

export async function hasAnyApiKey(): Promise<boolean> {
  const s = await loadSecrets()
  return Boolean(s.openai || s.anthropic || s.deepseek || s.google || s.mistral || s.groq)
}
