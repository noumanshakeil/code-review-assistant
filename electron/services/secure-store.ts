import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import Store from 'electron-store'
import type { ProviderId, ProviderSettings, StoredSecrets } from '../../src/shared/types'

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

/** Lazily created after Electron app is available — avoids Store crash before ready. */
let prefsStore: Store<Preferences> | null = null

function dataDir(): string {
  // Prefer Electron userData (correct inside Microsoft Store AppX). Fall back for Node smoke tests.
  try {
    const electron = require('electron') as { app?: { getPath: (name: string) => string } }
    if (electron.app?.getPath) return electron.app.getPath('userData')
  } catch {
    /* running outside Electron */
  }
  return path.join(homedir(), '.pocketmind-ai-reviewer')
}

function getPrefsStore(): Store<Preferences> {
  if (!prefsStore) {
    prefsStore = new Store<Preferences>({
      name: 'preferences',
      cwd: dataDir(),
      defaults,
    })
  }
  return prefsStore
}

function machineKeyPath(): string {
  return path.join(dataDir(), 'machine.key')
}

function secretsPath(): string {
  return path.join(dataDir(), 'secrets.enc')
}

function ensureMachineKey(): Buffer {
  const file = machineKeyPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(file)) {
    const key = randomBytes(32)
    fs.writeFileSync(file, key, { mode: 0o600 })
    return key
  }
  return fs.readFileSync(file)
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

export async function loadSecrets(): Promise<StoredSecrets> {
  const file = secretsPath()
  if (!fs.existsSync(file)) return {}
  try {
    return decryptJson<StoredSecrets>(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

export async function saveSecrets(secrets: StoredSecrets): Promise<void> {
  const cleaned: StoredSecrets = {}
  for (const [k, v] of Object.entries(secrets) as [keyof StoredSecrets, string | undefined][]) {
    if (v && v.trim()) cleaned[k] = v.trim()
  }
  const file = secretsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (Object.keys(cleaned).length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }
  fs.writeFileSync(file, encryptJson(cleaned), { mode: 0o600 })
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
  const store = getPrefsStore()
  const provider = store.get('provider')
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
  getPrefsStore().set('provider', settings)
  return settings
}

export function setSetupComplete(done: boolean): void {
  getPrefsStore().set('setupComplete', done)
}

export function setTheme(theme: Preferences['theme']): void {
  getPrefsStore().set('theme', theme)
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
