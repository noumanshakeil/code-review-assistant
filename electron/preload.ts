import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentCliStatus,
  CodeFile,
  LanguageId,
  LlmMessage,
  LlmResponse,
  ProposedMutation,
  ProviderSettings,
  ReviewResult,
  StoredSecrets,
  WorkspaceSnapshot,
  HumanizeResult,
  FolderIngestResult,
} from '../src/shared/types'

export interface CraApi {
  getInfo: () => Promise<{ version: string; platform: string; electron: string }>
  getPrefs: () => Promise<{
    provider: ProviderSettings
    theme: 'system' | 'light' | 'dark'
    lastWorkspaceId?: string
  }>
  setProvider: (settings: ProviderSettings) => Promise<ProviderSettings>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
  secretsStatus: () => Promise<Record<string, boolean>>
  saveSecrets: (secrets: StoredSecrets) => Promise<Record<string, boolean>>
  clearSecrets: (key?: keyof StoredSecrets) => Promise<Record<string, boolean>>
  openFolder: () => Promise<string | null>
  openModelFile: () => Promise<string | null>
  ingestFolder: (folderPath: string) => Promise<FolderIngestResult>
  ingestPaste: (content: string, language: LanguageId, fileName?: string) => Promise<WorkspaceSnapshot>
  ingestGithub: (url: string, token?: string) => Promise<FolderIngestResult>
  getWorkspace: () => Promise<WorkspaceSnapshot | null>
  setWorkspace: (workspace: WorkspaceSnapshot | null) => Promise<boolean>
  updateFile: (fileId: string, content: string) => Promise<WorkspaceSnapshot | null>
  runReview: (workspace?: WorkspaceSnapshot) => Promise<ReviewResult>
  runHumanize: (file: CodeFile) => Promise<HumanizeResult>
  proposeMutations: (instruction: string, workspace?: WorkspaceSnapshot) => Promise<ProposedMutation[]>
  applyMutation: (
    mutation: ProposedMutation,
    confirmed: boolean,
    workspace?: WorkspaceSnapshot,
  ) => Promise<{ ok: boolean; error?: string; mutation: ProposedMutation }>
  completeLlm: (messages: LlmMessage[]) => Promise<LlmResponse>
  detectAgents: () => Promise<AgentCliStatus[]>
  probeOllama: (baseUrl: string) => Promise<{ ok: boolean; models: string[]; error?: string }>
  confirmDestructive: (message: string, detail?: string) => Promise<boolean>
}

const api: CraApi = {
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setProvider: (settings) => ipcRenderer.invoke('prefs:setProvider', settings),
  setTheme: (theme) => ipcRenderer.invoke('prefs:setTheme', theme),
  secretsStatus: () => ipcRenderer.invoke('secrets:status'),
  saveSecrets: (secrets) => ipcRenderer.invoke('secrets:save', secrets),
  clearSecrets: (key) => ipcRenderer.invoke('secrets:clear', key),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openModelFile: () => ipcRenderer.invoke('dialog:openModelFile'),
  ingestFolder: (folderPath) => ipcRenderer.invoke('ingest:folder', folderPath),
  ingestPaste: (content, language, fileName) => ipcRenderer.invoke('ingest:paste', content, language, fileName),
  ingestGithub: (url, token) => ipcRenderer.invoke('ingest:github', url, token),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  setWorkspace: (workspace) => ipcRenderer.invoke('workspace:set', workspace),
  updateFile: (fileId, content) => ipcRenderer.invoke('workspace:updateFile', fileId, content),
  runReview: (workspace) => ipcRenderer.invoke('review:run', workspace),
  runHumanize: (file) => ipcRenderer.invoke('humanize:run', file),
  proposeMutations: (instruction, workspace) => ipcRenderer.invoke('mutate:propose', instruction, workspace),
  applyMutation: (mutation, confirmed, workspace) =>
    ipcRenderer.invoke('mutate:apply', mutation, confirmed, workspace),
  completeLlm: (messages) => ipcRenderer.invoke('llm:complete', messages),
  detectAgents: () => ipcRenderer.invoke('agents:detect'),
  probeOllama: (baseUrl) => ipcRenderer.invoke('local:probeOllama', baseUrl),
  confirmDestructive: (message, detail) => ipcRenderer.invoke('confirm:destructive', message, detail),
}

contextBridge.exposeInMainWorld('cra', api)
