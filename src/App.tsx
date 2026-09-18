import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardPaste,
  FolderOpen,
  GitBranch,
  Loader2,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  FileCode2,
  Play,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getApi, hasApi } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import {
  LANGUAGE_OPTIONS,
  extensionForLanguage,
  labelForLanguage,
  monacoLanguage,
} from '@/lib/languages'
import type {
  AgentCliStatus,
  AppMode,
  LanguageId,
  ProposedMutation,
  ProviderId,
  ProviderSettings,
} from '@/shared/types'

const MODES: { id: AppMode; label: string; hint: string }[] = [
  { id: 'ingest', label: 'Ingest & wait', hint: 'Load code, then idle until you act' },
  { id: 'github', label: 'GitHub clone', hint: 'Clone a repo, then same idle flow' },
  { id: 'review', label: 'Review', hint: 'AI code review findings' },
  { id: 'humanize', label: 'Humanize', hint: 'Rewrite style & identifiers' },
  { id: 'mutate', label: 'Write / edit / delete', hint: 'Propose changes — confirm to apply' },
]

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'mock', label: 'Mock (offline)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'groq', label: 'Groq' },
  { id: 'ollama', label: 'Ollama (local)' },
  { id: 'llamacpp', label: 'llama.cpp (GGUF)' },
  { id: 'cursor-cli', label: 'Cursor CLI' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
]

function SeverityPill({ severity }: { severity: string }) {
  const color =
    severity === 'critical' || severity === 'high'
      ? 'bg-[var(--danger)]/20 text-[#ffb4ae]'
      : severity === 'medium'
        ? 'bg-[var(--warn)]/20 text-[#ffd88a]'
        : 'bg-[var(--ok)]/15 text-[#9be7b8]'
  return <span className={cn('rounded px-2 py-0.5 text-[11px] uppercase tracking-wide', color)}>{severity}</span>
}

export default function App() {
  const store = useAppStore()
  const [paste, setPaste] = useState('')
  const [pasteLang, setPasteLang] = useState<LanguageId>('typescript')
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [mutatePrompt, setMutatePrompt] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agents, setAgents] = useState<AgentCliStatus[]>([])
  const [pendingMutation, setPendingMutation] = useState<ProposedMutation | null>(null)
  const [bridgeReady, setBridgeReady] = useState(hasApi())
  const [secretDraft, setSecretDraft] = useState({
    openai: '',
    anthropic: '',
    deepseek: '',
    google: '',
    mistral: '',
    groq: '',
    github: '',
  })

  const selectedFile = useMemo(
    () => store.workspace?.files.find((f) => f.id === store.selectedFileId) ?? null,
    [store.workspace, store.selectedFileId],
  )

  useEffect(() => {
    const boot = async () => {
      if (!hasApi()) {
        // Electron preload may attach a tick after first paint in some builds
        const timer = setInterval(() => {
          if (hasApi()) {
            setBridgeReady(true)
            clearInterval(timer)
          }
        }, 100)
        setTimeout(() => clearInterval(timer), 5000)
        return
      }
      setBridgeReady(true)
      try {
        const api = getApi()
        const prefs = await api.getPrefs()
        store.setProvider(prefs.provider)
        store.setSecretStatus(await api.secretsStatus())
        setAgents(await api.detectAgents())
      } catch (err) {
        store.setError(err instanceof Error ? err.message : String(err))
      }
    }
    void boot()
  }, [])

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    store.setBusy(label)
    store.setError(null)
    try {
      await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      store.setError(message)
      toast.error(message)
    } finally {
      store.setBusy(null)
    }
  }

  const onPasteIngest = () =>
    withBusy('Ingesting paste…', async () => {
      const content = paste
      if (!content.trim()) {
        throw new Error(
          store.workspace
            ? 'Paste new text in the compose box above, then click Ingest. Editing the loaded file does not replace the workspace until you re-ingest.'
            : 'Paste some code first.',
        )
      }
      const fileName = `snippet.${extensionForLanguage(pasteLang)}`
      const ws = await getApi().ingestPaste(content, pasteLang, fileName)
      // Ensure main-process + UI both point at the new workspace only
      await getApi().setWorkspace(ws)
      store.setWorkspace(ws)
      store.setMode('ingest')
      setPaste('')
      toast.success(`Loaded ${labelForLanguage(pasteLang)} paste as ${ws.files[0]?.relativePath}`)
    })

  const onStartNewPaste = () => {
    setPaste('')
    store.setMode('ingest')
    toast.message('Compose a new paste below, then Ingest to replace the current workspace.')
  }

  const onFolderIngest = () =>
    withBusy('Scanning folder…', async () => {
      const folder = await getApi().openFolder()
      if (!folder) return
      const result = await getApi().ingestFolder(folder)
      store.setWorkspace(result.workspace)
      store.setMode('ingest')
      toast.success(`Ingested ${result.workspace.files.length} files (skipped ${result.skipped.length})`)
    })

  const onGithubClone = () =>
    withBusy('Cloning repository…', async () => {
      if (!githubUrl.trim()) throw new Error('Enter a GitHub URL or owner/repo.')
      const result = await getApi().ingestGithub(githubUrl.trim(), githubToken.trim() || undefined)
      store.setWorkspace(result.workspace)
      store.setMode('ingest')
      toast.success(`Cloned ${result.workspace.name} · ${result.workspace.files.length} files`)
    })

  const onReview = () =>
    withBusy('Running review…', async () => {
      const ws = (await getApi().getWorkspace()) || store.workspace
      if (!ws) throw new Error('Ingest code first.')
      store.syncWorkspace(ws)
      const review = await getApi().runReview(ws)
      store.setReview(review)
      store.setMode('review')
      toast.success(
        `${review.provider === 'mock' ? 'Mock review ready' : 'Review complete'} · ${ws.files[0]?.relativePath ?? ws.name}`,
      )
    })

  const onHumanize = () =>
    withBusy('Humanizing…', async () => {
      const ws = (await getApi().getWorkspace()) || store.workspace
      if (!ws) throw new Error('Ingest code first.')
      store.syncWorkspace(ws)
      const file = ws.files.find((f) => f.id === store.selectedFileId) ?? ws.files[0]
      if (!file) throw new Error('Select a file to humanize.')
      const result = await getApi().runHumanize(file)
      store.setHumanize(result)
      store.setMode('humanize')
      toast.success(`Humanized draft ready · ${file.relativePath} (${labelForLanguage(file.language)})`)
    })

  const applyHumanize = () =>
    withBusy('Applying humanized code…', async () => {
      if (!store.humanize || !selectedFile || !store.workspace) return
      const ok = await getApi().confirmDestructive(
        'Apply humanized code?',
        `This will replace ${store.humanize.filePath}. Behavior should stay equivalent, but review the diff first.`,
      )
      if (!ok) return
      if (store.workspace.rootPath) {
        const mutation: ProposedMutation = {
          id: store.humanize.id,
          kind: 'edit',
          path: store.humanize.filePath,
          before: store.humanize.original,
          after: store.humanize.humanized,
          rationale: 'Apply humanized rewrite',
          confirmed: true,
          applied: false,
        }
        const result = await getApi().applyMutation(mutation, true, store.workspace)
        if (!result.ok) throw new Error(result.error || 'Apply failed')
      }
      const updated = await getApi().updateFile(selectedFile.id, store.humanize.humanized)
      if (updated) store.setWorkspace(updated)
      toast.success('Humanized code applied')
    })

  const onProposeMutations = () =>
    withBusy('Proposing mutations…', async () => {
      if (!store.workspace) throw new Error('Ingest code first.')
      if (!mutatePrompt.trim()) throw new Error('Describe the write/edit/delete you want.')
      const mutations = await getApi().proposeMutations(mutatePrompt.trim(), store.workspace)
      store.setMutations(mutations)
      store.setMode('mutate')
      toast.success(`${mutations.length} proposed change(s) — confirm each before apply`)
    })

  const confirmApplyMutation = async (mutation: ProposedMutation) => {
    setPendingMutation(mutation)
  }

  const doApplyMutation = () =>
    withBusy('Applying mutation…', async () => {
      if (!pendingMutation || !store.workspace) return
      const ok = await getApi().confirmDestructive(
        `${pendingMutation.kind.toUpperCase()} ${pendingMutation.path}?`,
        pendingMutation.rationale,
      )
      if (!ok) {
        setPendingMutation(null)
        return
      }
      const result = await getApi().applyMutation(pendingMutation, true, store.workspace)
      if (!result.ok) throw new Error(result.error || 'Apply failed')
      store.setMutations(
        store.mutations.map((m) => (m.id === pendingMutation.id ? { ...result.mutation } : m)),
      )
      const ws = await getApi().getWorkspace()
      if (ws) store.setWorkspace(ws)
      setPendingMutation(null)
      toast.success('Mutation applied')
    })

  const saveSettings = () =>
    withBusy('Saving settings…', async () => {
      if (!store.provider) return
      await getApi().setProvider(store.provider)
      const secrets = Object.fromEntries(
        Object.entries(secretDraft).filter(([, v]) => v.trim()),
      )
      if (Object.keys(secrets).length) {
        store.setSecretStatus(await getApi().saveSecrets(secrets))
        setSecretDraft({
          openai: '',
          anthropic: '',
          deepseek: '',
          google: '',
          mistral: '',
          groq: '',
          github: '',
        })
      }
      setAgents(await getApi().detectAgents())
      setSettingsOpen(false)
      toast.success('Settings saved (keys stored in OS keychain / encrypted local vault)')
    })

  const updateProvider = (patch: Partial<ProviderSettings>) => {
    if (!store.provider) return
    store.setProvider({ ...store.provider, ...patch })
  }

  const updateLocal = (patch: Partial<ProviderSettings['local']>) => {
    if (!store.provider) return
    store.setProvider({ ...store.provider, local: { ...store.provider.local, ...patch } })
  }

  if (!bridgeReady) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md animate-rise text-center">
          <Bot className="mx-auto mb-4 h-10 w-10 text-[var(--accent)] animate-pulse-soft" />
          <h1 className="text-2xl font-semibold tracking-tight">Code Review Assistant</h1>
          <p className="mt-2 text-[var(--muted)]">
            Waiting for the desktop bridge. Start the app with <code className="text-[var(--accent)]">npm run dev</code>.
          </p>
        </div>
        <Toaster theme="dark" richColors position="bottom-right" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <div className="mr-2 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Code Review Assistant</div>
            <div className="text-[11px] text-[var(--muted)]">Review · Humanize · Mutate with confirmation</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              onClick={() => store.setMode(m.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                store.mode === m.id
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
              )}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          Models & keys
        </Button>
      </header>

      {store.busy && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          {store.busy}
        </div>
      )}

      {store.error && (
        <div className="flex items-start gap-2 border-b border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <span>{store.error}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--border)] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Ingest</div>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" onClick={onFolderIngest}>
                <FolderOpen className="h-4 w-4" />
                Upload folder
              </Button>
              <Button variant="secondary" size="sm" onClick={() => store.setMode('github')}>
                <GitBranch className="h-4 w-4" />
                Clone GitHub
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {!store.workspace && (
              <div className="animate-rise rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
                No workspace yet. Paste code, open a folder, or clone a repo — the app will wait until you choose a mode.
              </div>
            )}
            {store.workspace && (
              <>
                <div className="mb-2 px-1 text-xs text-[var(--muted)]">
                  <div className="font-medium text-[var(--fg)]">{store.workspace.name}</div>
                  <div>
                    {store.workspace.files.length} files · {store.workspace.kind}
                  </div>
                </div>
                {store.workspace.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => store.setSelectedFileId(f.id)}
                    className={cn(
                      'mb-1 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      store.selectedFileId === f.id
                        ? 'bg-[var(--surface-3)] text-[var(--fg)]'
                        : 'text-[var(--muted)] hover:bg-[var(--surface-2)]',
                    )}
                  >
                    <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate font-mono">{f.relativePath}</span>
                      <span className="text-[10px] opacity-70">
                        {f.language} · {formatBytes(f.size)}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          {(store.mode === 'ingest' || store.mode === 'github') && (
            <div className="animate-rise grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
              <div className="border-b border-[var(--border)] p-4">
                {store.mode === 'github' ? (
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    <h2 className="text-lg font-semibold">Clone a GitHub repository</h2>
                    <p className="text-sm text-[var(--muted)]">
                      Public repos clone without a token. Private repos need a GitHub token (Settings or field below).
                    </p>
                    <Input
                      placeholder="https://github.com/org/repo or org/repo"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="GitHub token (optional for public)"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                    />
                    <Button onClick={onGithubClone} disabled={!!store.busy}>
                      <GitBranch className="h-4 w-4" />
                      Clone & ingest
                    </Button>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {store.workspace ? 'Paste new code (replaces workspace)' : 'Paste code & wait'}
                        </h2>
                        <p className="text-sm text-[var(--muted)]">
                          {store.workspace
                            ? `Currently loaded: ${store.workspace.name} (${labelForLanguage(
                                store.workspace.files[0]?.language ?? 'plaintext',
                              )}). Paste below and click Ingest to replace it before Review/Humanize.`
                            : `Load a snippet, then sit idle until you run Review, Humanize, or Mutate. ${LANGUAGE_OPTIONS.length} languages supported, including C++.`}
                        </p>
                      </div>
                      {store.workspace && (
                        <Button variant="outline" size="sm" type="button" onClick={onStartNewPaste}>
                          Clear compose box
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px]">
                        <Label htmlFor="lang">Language</Label>
                        <select
                          id="lang"
                          className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                          value={pasteLang}
                          onChange={(e) => setPasteLang(e.target.value as LanguageId)}
                        >
                          {LANGUAGE_OPTIONS.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button onClick={onPasteIngest} disabled={!!store.busy}>
                        <ClipboardPaste className="h-4 w-4" />
                        {store.workspace ? 'Replace & ingest' : 'Ingest paste'}
                      </Button>
                    </div>
                    <Textarea
                      className="min-h-[160px] font-mono text-sm"
                      placeholder={
                        pasteLang === 'cpp'
                          ? '// Paste C++ here, then Replace & ingest…'
                          : pasteLang === 'plaintext'
                            ? 'Paste plain text here, then Replace & ingest…'
                            : '// Paste source here, then ingest…'
                      }
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="min-h-0">
                {store.mode === 'ingest' && selectedFile ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                      Loaded file · {selectedFile.relativePath} · {labelForLanguage(selectedFile.language)} — edits here
                      update this file only; they do not change the compose box above.
                    </div>
                    <div className="min-h-0 flex-1">
                      <Editor
                        height="100%"
                        theme="vs-dark"
                        language={monacoLanguage(selectedFile.language)}
                        value={selectedFile.content}
                        options={{
                          minimap: { enabled: false },
                          fontFamily: 'IBM Plex Mono, Cascadia Code, monospace',
                          fontSize: 13,
                          readOnly: false,
                          automaticLayout: true,
                        }}
                        onChange={(value) => {
                          if (value === undefined || !selectedFile) return
                          void getApi()
                            .updateFile(selectedFile.id, value)
                            .then((ws) => {
                              if (!ws) return
                              store.syncWorkspace(ws)
                            })
                        }}
                      />
                    </div>
                  </div>
                ) : store.mode === 'ingest' ? (
                  <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--muted)]">
                    Nothing loaded yet. Use the compose box above, then Ingest.
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                    Clone a repository to populate the editor.
                  </div>
                )}
              </div>
            </div>
          )}

          {store.mode === 'review' && (
            <div className="animate-rise flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Code review</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Reviews code or pasted plaintext/prose. Sidebar file list proves ingest worked — re-run after Replace &
                    ingest if you changed content.
                  </p>
                </div>
                <Button onClick={onReview} disabled={!!store.busy || !store.workspace}>
                  <Play className="h-4 w-4" />
                  Run review
                </Button>
              </div>
              {!store.review && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                  No review yet. Ingest code, then run a review.
                </div>
              )}
              {store.review && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
                    <div className="mb-1 text-xs text-[var(--muted)]">
                      {store.review.provider} · {store.review.model}
                    </div>
                    <p className="text-sm leading-relaxed">{store.review.summary}</p>
                  </div>
                  {store.review.findings.map((f) => (
                    <div key={f.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <SeverityPill severity={f.severity} />
                        <span className="font-medium">{f.title}</span>
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {f.file}
                          {f.line ? `:${f.line}` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted)]">{f.detail}</p>
                      {f.suggestion && (
                        <p className="mt-2 text-sm text-[var(--accent)]">Suggestion: {f.suggestion}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {store.mode === 'humanize' && (
            <div className="animate-rise flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
                <div>
                  <h2 className="text-lg font-semibold">Humanize</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Rename and restyle for common AI-detection heuristics — apply only after you confirm.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={onHumanize} disabled={!!store.busy || !selectedFile}>
                    <Wand2 className="h-4 w-4" />
                    Humanize file
                  </Button>
                  <Button onClick={applyHumanize} disabled={!!store.busy || !store.humanize}>
                    <Check className="h-4 w-4" />
                    Confirm & apply
                  </Button>
                </div>
              </div>
              {!store.humanize ? (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--muted)]">
                  Select a file and generate a humanized draft.
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 grid-rows-2 lg:grid-rows-1 lg:grid-cols-2">
                  <div className="min-h-0 border-b border-[var(--border)] lg:border-b-0 lg:border-r">
                    <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">Original</div>
                    <Editor height="100%" theme="vs-dark" language={monacoLanguage(selectedFile?.language || 'plaintext')} value={store.humanize.original} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }} />
                  </div>
                  <div className="min-h-0">
                    <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                      Humanized · {store.humanize.notes.join(' · ')}
                    </div>
                    <Editor height="100%" theme="vs-dark" language={monacoLanguage(selectedFile?.language || 'plaintext')} value={store.humanize.humanized} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {store.mode === 'mutate' && (
            <div className="animate-rise flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div>
                <h2 className="text-lg font-semibold">Write / edit / delete</h2>
                <p className="text-sm text-[var(--muted)]">
                  The AI only proposes mutations. Nothing is written until you confirm each change.
                </p>
              </div>
              <Textarea
                placeholder="e.g. Add input validation to the main entry file and delete unused temp helpers"
                value={mutatePrompt}
                onChange={(e) => setMutatePrompt(e.target.value)}
              />
              <Button onClick={onProposeMutations} disabled={!!store.busy || !store.workspace} className="w-fit">
                <Bot className="h-4 w-4" />
                Propose mutations
              </Button>
              {store.mutations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                  No proposals yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {store.mutations.map((m) => (
                    <div key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-[11px] uppercase">{m.kind}</span>
                        <span className="font-mono text-sm">{m.path}</span>
                        {m.applied && (
                          <span className="flex items-center gap-1 text-xs text-[var(--ok)]">
                            <Check className="h-3 w-3" /> Applied
                          </span>
                        )}
                      </div>
                      <p className="mb-3 text-sm text-[var(--muted)]">{m.rationale}</p>
                      {m.after && (
                        <pre className="mb-3 max-h-40 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs">{m.after}</pre>
                      )}
                      <Button
                        size="sm"
                        variant={m.kind === 'delete' ? 'danger' : 'default'}
                        disabled={m.applied || !!store.busy}
                        onClick={() => void confirmApplyMutation(m)}
                      >
                        {m.kind === 'delete' ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        Confirm & apply
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="hidden min-h-0 flex-col border-l border-[var(--border)] lg:flex">
          <div className="border-b border-[var(--border)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Provider</div>
            <div className="mt-1 text-sm font-medium">{store.provider?.activeProvider ?? '—'}</div>
            <div className="text-xs text-[var(--muted)]">{store.provider?.model}</div>
          </div>
          <div className="space-y-3 overflow-auto p-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Agent CLIs</div>
              {agents.length === 0 && <p className="text-[var(--muted)]">Scanning…</p>}
              {agents.map((a) => (
                <div key={a.id} className="mb-1 flex items-center justify-between gap-2">
                  <span>{a.name}</span>
                  <span className={a.available ? 'text-[var(--ok)]' : 'text-[var(--muted)]'}>
                    {a.available ? 'linked' : 'not found'}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Keys on device</div>
              {Object.entries(store.secretStatus).length === 0 && (
                <p className="text-[var(--muted)]">No keys stored yet.</p>
              )}
              {Object.entries(store.secretStatus).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className={v ? 'text-[var(--ok)]' : 'text-[var(--muted)]'}>{v ? 'set' : '—'}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Local models use concurrency caps, thread limits, and GPU offload controls (CUDA / Vulkan / CPU) so inference does not hard-lock the machine.
            </p>
          </div>
        </aside>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Models & secure keys</DialogTitle>
            <DialogDescription>
              API keys are stored via OS keychain (keytar) with an encrypted file fallback — never committed to the repo.
            </DialogDescription>
          </DialogHeader>
          {store.provider && (
            <div className="space-y-4">
              <div>
                <Label>Active provider</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                  value={store.provider.activeProvider}
                  onChange={(e) => updateProvider({ activeProvider: e.target.value as ProviderId })}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Model id</Label>
                <Input
                  className="mt-1"
                  value={store.provider.model}
                  onChange={(e) => updateProvider({ model: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Temperature</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={store.provider.temperature}
                    onChange={(e) => updateProvider({ temperature: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max tokens</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={store.provider.maxTokens}
                    onChange={(e) => updateProvider({ maxTokens: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="mb-2 text-sm font-medium">Local GPU / CPU</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Backend</Label>
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                      value={store.provider.local.backend}
                      onChange={(e) => updateLocal({ backend: e.target.value as ProviderSettings['local']['backend'] })}
                    >
                      <option value="auto">auto</option>
                      <option value="cuda">CUDA</option>
                      <option value="vulkan">Vulkan</option>
                      <option value="cpu">CPU only</option>
                    </select>
                  </div>
                  <div>
                    <Label>GPU layers</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      value={store.provider.local.gpuLayers}
                      onChange={(e) => updateLocal({ gpuLayers: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>CPU threads (capped)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      value={store.provider.local.cpuThreads}
                      onChange={(e) => updateLocal({ cpuThreads: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Max concurrent jobs</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={1}
                      max={2}
                      value={store.provider.local.maxConcurrent}
                      onChange={(e) => updateLocal({ maxConcurrent: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <Label>Ollama base URL</Label>
                  <Input
                    value={store.provider.local.ollamaBaseUrl}
                    onChange={(e) => updateLocal({ ollamaBaseUrl: e.target.value })}
                  />
                  <Label>Ollama model</Label>
                  <Input
                    value={store.provider.local.ollamaModel}
                    onChange={(e) => updateLocal({ ollamaModel: e.target.value })}
                  />
                  <Label>llama.cpp binary</Label>
                  <Input
                    value={store.provider.local.llamaCppBin}
                    onChange={(e) => updateLocal({ llamaCppBin: e.target.value })}
                    placeholder="/usr/local/bin/llama-cli"
                  />
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={store.provider.local.modelPath}
                      onChange={(e) => updateLocal({ modelPath: e.target.value })}
                      placeholder="GGUF model path"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        const p = await getApi().openModelFile()
                        if (p) updateLocal({ modelPath: p })
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const probe = await getApi().probeOllama(store.provider!.local.ollamaBaseUrl)
                      if (probe.ok) toast.success(`Ollama ok · ${probe.models.slice(0, 5).join(', ') || 'no models'}`)
                      else toast.error(probe.error || 'Ollama unreachable')
                    }}
                  >
                    Probe Ollama
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">API keys (leave blank to keep existing)</div>
                {(
                  [
                    ['openai', 'OpenAI'],
                    ['anthropic', 'Anthropic'],
                    ['deepseek', 'DeepSeek'],
                    ['google', 'Google'],
                    ['mistral', 'Mistral'],
                    ['groq', 'Groq'],
                    ['github', 'GitHub token'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <Label>
                      {label}
                      {store.secretStatus[key] ? ' · saved' : ''}
                    </Label>
                    <Input
                      className="mt-1"
                      type="password"
                      autoComplete="off"
                      value={secretDraft[key]}
                      onChange={(e) => setSecretDraft((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder={store.secretStatus[key] ? '•••••••• (unchanged)' : 'sk-…'}
                    />
                  </div>
                ))}
              </div>

              <Button onClick={saveSettings} disabled={!!store.busy}>
                Save settings
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMutation} onOpenChange={(o) => !o && setPendingMutation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm mutation</DialogTitle>
            <DialogDescription>
              {pendingMutation
                ? `${pendingMutation.kind.toUpperCase()} ${pendingMutation.path}. This changes files on disk when a folder/repo workspace is loaded.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[var(--muted)]">{pendingMutation?.rationale}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingMutation(null)}>
              Cancel
            </Button>
            <Button variant={pendingMutation?.kind === 'delete' ? 'danger' : 'default'} onClick={doApplyMutation}>
              Confirm apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster theme="dark" richColors position="bottom-right" />
    </div>
  )
}
