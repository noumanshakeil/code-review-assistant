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

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'ollama'
  | 'llamacpp'
  | 'mock'
  | 'cursor-cli'
  | 'claude-code'
  | 'codex'

export type GpuBackend = 'auto' | 'cuda' | 'vulkan' | 'cpu'

export interface LocalModelSettings {
  backend: GpuBackend
  gpuLayers: number
  cpuThreads: number
  contextSize: number
  maxConcurrent: number
  modelPath: string
  llamaCppBin: string
  ollamaBaseUrl: string
  ollamaModel: string
}

export interface ProviderSettings {
  activeProvider: ProviderId
  model: string
  temperature: number
  maxTokens: number
  local: LocalModelSettings
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

export interface AgentCliStatus {
  id: 'cursor-cli' | 'claude-code' | 'codex'
  name: string
  available: boolean
  path?: string
  version?: string
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
  summary: string
  findings: ReviewFinding[]
  provider: ProviderId
  model: string
  createdAt: string
}

export interface HumanizeResult {
  id: string
  filePath: string
  original: string
  humanized: string
  notes: string[]
  provider: ProviderId
  model: string
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
