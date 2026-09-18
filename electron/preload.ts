import { contextBridge, ipcRenderer } from 'electron'
import type {
  HumanizeResult,
  LanguageId,
  LlmMessage,
  LlmResponse,
  ProposedMutation,
  ProviderId,
  ProviderSettings,
  ReviewResult,
  StoredSecrets,
  WorkspaceSnapshot,
  FolderIngestResult,
} from '../src/shared/types'

export interface CraApi {
  getInfo: () => Promise<{ version: string; platform: string; electron: string }>
  getPrefs: () => Promise<{
    provider: ProviderSettings
    theme: 'system' | 'light' | 'dark'
    setupComplete?: boolean
  }>
  setProvider: (settings: ProviderSettings) => Promise<ProviderSettings>
  setSetupComplete: (done: boolean) => Promise<boolean>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
  hasApiKey: () => Promise<boolean>
  secretsStatus: () => Promise<Record<string, boolean>>
  saveSecrets: (secrets: StoredSecrets) => Promise<Record<string, boolean>>
  clearSecrets: (key?: keyof StoredSecrets) => Promise<Record<string, boolean>>
  listModels: (provider: ProviderId) => Promise<string[]>
  defaultModel: (provider: ProviderId) => Promise<string>
  openFolder: () => Promise<string | null>
  ingestFolder: (folderPath: string) => Promise<FolderIngestResult>
  ingestPaste: (
    content: string,
    language: LanguageId,
    fileName?: string,
    append?: boolean,
  ) => Promise<WorkspaceSnapshot>
  ingestGithub: (url: string, token?: string) => Promise<FolderIngestResult>
  getWorkspace: () => Promise<WorkspaceSnapshot | null>
  setWorkspace: (workspace: WorkspaceSnapshot | null) => Promise<boolean>
  updateFile: (fileId: string, content: string) => Promise<WorkspaceSnapshot | null>
  runReviewSelected: (fileIds: string[]) => Promise<ReviewResult[]>
  runHumanizeSelected: (fileIds: string[]) => Promise<HumanizeResult[]>
  proposeMutations: (instruction: string, fileIds?: string[]) => Promise<ProposedMutation[]>
  applyMutation: (
    mutation: ProposedMutation,
    confirmed: boolean,
  ) => Promise<{ ok: boolean; error?: string; mutation: ProposedMutation }>
  completeLlm: (messages: LlmMessage[]) => Promise<LlmResponse>
  confirmDestructive: (message: string, detail?: string) => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
}

const api: CraApi = {
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setProvider: (settings) => ipcRenderer.invoke('prefs:setProvider', settings),
  setSetupComplete: (done) => ipcRenderer.invoke('prefs:setSetupComplete', done),
  setTheme: (theme) => ipcRenderer.invoke('prefs:setTheme', theme),
  hasApiKey: () => ipcRenderer.invoke('prefs:hasApiKey'),
  secretsStatus: () => ipcRenderer.invoke('secrets:status'),
  saveSecrets: (secrets) => ipcRenderer.invoke('secrets:save', secrets),
  clearSecrets: (key) => ipcRenderer.invoke('secrets:clear', key),
  listModels: (provider) => ipcRenderer.invoke('models:list', provider),
  defaultModel: (provider) => ipcRenderer.invoke('models:default', provider),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  ingestFolder: (folderPath) => ipcRenderer.invoke('ingest:folder', folderPath),
  ingestPaste: (content, language, fileName, append) =>
    ipcRenderer.invoke('ingest:paste', content, language, fileName, append),
  ingestGithub: (url, token) => ipcRenderer.invoke('ingest:github', url, token),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  setWorkspace: (workspace) => ipcRenderer.invoke('workspace:set', workspace),
  updateFile: (fileId, content) => ipcRenderer.invoke('workspace:updateFile', fileId, content),
  runReviewSelected: (fileIds) => ipcRenderer.invoke('review:runSelected', fileIds),
  runHumanizeSelected: (fileIds) => ipcRenderer.invoke('humanize:runSelected', fileIds),
  proposeMutations: (instruction, fileIds) => ipcRenderer.invoke('mutate:propose', instruction, fileIds),
  applyMutation: (mutation, confirmed) => ipcRenderer.invoke('mutate:apply', mutation, confirmed),
  completeLlm: (messages) => ipcRenderer.invoke('llm:complete', messages),
  confirmDestructive: (message, detail) => ipcRenderer.invoke('confirm:destructive', message, detail),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

contextBridge.exposeInMainWorld('cra', api)
