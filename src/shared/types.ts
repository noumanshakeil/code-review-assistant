export type SourceKind = 'paste' | 'folder' | 'github'

export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'kotlin'
  | 'swift'
  | 'ruby'
  | 'php'
  | 'scala'
  | 'lua'
  | 'shell'
  | 'sql'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'plaintext'

export interface CodeFile {
  id: string
  path: string
  relativePath: string
  language: LanguageId
  content: string
  size: number
}

export interface WorkspaceSnapshot {
  id: string
  kind: SourceKind
  name: string
  rootPath?: string
  files: CodeFile[]
  createdAt: string
  githubUrl?: string
}

/** Providers shown in the UI (API-key based only). */
export type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'google' | 'mistral' | 'groq'

export interface ProviderSettings {
  activeProvider: ProviderId
  model: string
  temperature: number
  maxTokens: number
}

export interface StoredSecrets {
  openai?: string
  anthropic?: string
  deepseek?: string
  google?: string
  mistral?: string
  groq?: string
  github?: string
}

export type AppMode = 'ingest' | 'github' | 'humanize' | 'mutate' | 'review'

export interface ReviewFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  file: string
  line?: number
  title: string
  detail: string
  suggestion?: string
}

export interface ReviewResult {
  id: string
  fileId: string
  filePath: string
  summary: string
  findings: ReviewFinding[]
  provider: ProviderId
  model: string
  createdAt: string
  error?: string
}

export interface HumanizeResult {
  id: string
  fileId: string
  filePath: string
  original: string
  humanized: string
  notes: string[]
  provider: ProviderId
  model: string
  error?: string
}

export type MutationKind = 'write' | 'edit' | 'delete'

export interface ProposedMutation {
  id: string
  kind: MutationKind
  path: string
  before?: string
  after?: string
  rationale: string
  confirmed: boolean
  applied: boolean
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  provider: ProviderId
  model: string
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
}

export interface LlmResponse {
  content: string
  provider: ProviderId
  model: string
  mocked: boolean
}

export interface CloneRequest {
  url: string
  token?: string
  depth?: number
}

export interface FolderIngestResult {
  workspace: WorkspaceSnapshot
  skipped: string[]
}

export const API_PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'groq', label: 'Groq' },
]

export const MAX_SELECTED_FILES = 5
