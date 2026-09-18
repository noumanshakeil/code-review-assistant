import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  AlertTriangle,
  Check,
  CircleHelp,
  ClipboardPaste,
  FolderOpen,
  GitBranch,
  Loader2,
  Mail,
  Play,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
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
import { FileTree } from '@/components/file-tree'
import { getApi, hasApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  LANGUAGE_OPTIONS,
  extensionForLanguage,
  labelForLanguage,
  monacoLanguage,
} from '@/lib/languages'
import { useAppStore } from '@/store/app-store'
import {
  API_PROVIDERS,
  MAX_SELECTED_FILES,
  type AppMode,
  type LanguageId,
  type ProposedMutation,
  type ProviderId,
  type ProviderSettings,
  type StoredSecrets,
} from '@/shared/types'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'github', label: 'GitHub' },
  { id: 'review', label: 'Review' },
  { id: 'humanize', label: 'Humanize' },
  { id: 'mutate', label: 'Edit' },
]

const SUPPORT_EMAIL = 'support.pocketmind@gmail.com'
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('PocketMind AI: Reviewer And Humanizer support')}`
const PRIVACY_URL = 'https://noumanshakeil.github.io/#privacy-policy'
const APP_DISPLAY_NAME = 'PocketMind AI: Reviewer And Humanizer'

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
  const [bridgeReady, setBridgeReady] = useState(hasApi())
  const [paste, setPaste] = useState('')
  const [pasteLang, setPasteLang] = useState<LanguageId>('typescript')
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [mutatePrompt, setMutatePrompt] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pendingMutation, setPendingMutation] = useState<ProposedMutation | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [settingsProvider, setSettingsProvider] = useState<ProviderId>('openai')

  const previewFile = useMemo(
    () => store.workspace?.files.find((f) => f.id === store.activePreviewId) ?? null,
    [store.workspace, store.activePreviewId],
  )

  const selectedFiles = useMemo(
    () => store.workspace?.files.filter((f) => store.selectedFileIds.includes(f.id)) ?? [],
    [store.workspace, store.selectedFileIds],
  )

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

  const refreshModels = async (provider: ProviderId) => {
    setLoadingModels(true)
    try {
      const list = await getApi().listModels(provider)
      setModels(list)
      return list
    } catch {
      setModels([])
      return [] as string[]
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    const boot = async () => {
      if (!hasApi()) {
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
        setSettingsProvider(prefs.provider.activeProvider)
        const status = await api.secretsStatus()
        store.setSecretStatus(status)
        const hasKey = await api.hasApiKey()
        const needs = !hasKey
        store.setNeedsSetup(needs)
        if (needs) setSettingsOpen(true)
        if (hasKey) {
          const list = await refreshModels(prefs.provider.activeProvider)
          if (list.length && !list.includes(prefs.provider.model)) {
            const next = { ...prefs.provider, model: list[0] }
            await api.setProvider(next)
            store.setProvider(next)
          }
        }
      } catch (err) {
        store.setError(err instanceof Error ? err.message : String(err))
      }
    }
    void boot()
  }, [])

  const requireKey = () => {
    if (store.needsSetup || !Object.values(store.secretStatus).some(Boolean)) {
      setSettingsOpen(true)
      throw new Error('Add an API key in Models & keys first.')
    }
  }

  const onPasteIngest = () =>
    withBusy('Ingesting…', async () => {
      if (!paste.trim()) throw new Error('Paste text or code first.')
      const fileName = `snippet.${extensionForLanguage(pasteLang)}`
      const append = store.workspace?.kind === 'paste'
      const ws = await getApi().ingestPaste(paste, pasteLang, fileName, append)
      store.setWorkspace(ws)
      store.setMode('ingest')
      setPaste('')
      toast.success(`Added ${labelForLanguage(pasteLang)} · ${ws.files.length} file(s) in workspace`)
    })

  const onFolderIngest = () =>
    withBusy('Scanning folder…', async () => {
      const folder = await getApi().openFolder()
      if (!folder) return
      const result = await getApi().ingestFolder(folder)
      store.setWorkspace(result.workspace)
      store.setMode('ingest')
      toast.success(`${result.workspace.files.length} files loaded`)
    })

  const onGithubClone = () =>
    withBusy('Cloning…', async () => {
      if (!githubUrl.trim()) throw new Error('Enter a GitHub URL or owner/repo.')
      const result = await getApi().ingestGithub(githubUrl.trim(), githubToken.trim() || undefined)
      store.setWorkspace(result.workspace)
      store.setMode('ingest')
      toast.success(`Cloned ${result.workspace.name}`)
    })

  const onReview = () =>
    withBusy(`Reviewing ${store.selectedFileIds.length} file(s)…`, async () => {
      requireKey()
      if (!store.selectedFileIds.length) throw new Error(`Select 1–${MAX_SELECTED_FILES} files in the tree.`)
      const results = await getApi().runReviewSelected(store.selectedFileIds)
      store.setReviews(results)
      store.setMode('review')
      const failed = results.filter((r) => r.error).length
      toast.success(
        failed ? `Review done · ${results.length - failed} ok, ${failed} failed` : `Reviewed ${results.length} file(s)`,
      )
    })

  const onHumanize = () =>
    withBusy(`Humanizing ${store.selectedFileIds.length} file(s)…`, async () => {
      requireKey()
      if (!store.selectedFileIds.length) throw new Error(`Select 1–${MAX_SELECTED_FILES} files in the tree.`)
      const results = await getApi().runHumanizeSelected(store.selectedFileIds)
      store.setHumanizeResults(results)
      store.setMode('humanize')
      toast.success(`Humanized ${results.filter((r) => !r.error).length} file(s)`)
    })

  const applyHumanizeOne = (fileId: string) =>
    withBusy('Applying humanized text…', async () => {
      const item = store.humanizeResults.find((h) => h.fileId === fileId)
      if (!item || !store.workspace) return
      const ok = await getApi().confirmDestructive(
        `Apply humanized version of ${item.filePath}?`,
        'This replaces the file contents after you confirm.',
      )
      if (!ok) return
      const mutation: ProposedMutation = {
        id: item.id,
        kind: 'edit',
        path: item.filePath,
        before: item.original,
        after: item.humanized,
        rationale: 'Apply humanized rewrite',
        confirmed: true,
        applied: false,
      }
      const result = await getApi().applyMutation(mutation, true)
      if (!result.ok) throw new Error(result.error || 'Apply failed')
      const file = store.workspace.files.find((f) => f.id === fileId)
      if (file) {
        const updated = await getApi().updateFile(file.id, item.humanized)
        if (updated) store.syncWorkspace(updated)
      }
      toast.success(`Applied ${item.filePath}`)
    })

  const onProposeMutations = () =>
    withBusy('Proposing edits…', async () => {
      requireKey()
      if (!mutatePrompt.trim()) throw new Error('Describe the change you want.')
      if (!store.selectedFileIds.length) throw new Error(`Select 1–${MAX_SELECTED_FILES} files.`)
      const mutations = await getApi().proposeMutations(mutatePrompt.trim(), store.selectedFileIds)
      store.setMutations(mutations)
      store.setMode('mutate')
      toast.success(`${mutations.length} proposal(s)`)
    })

  const doApplyMutation = () =>
    withBusy('Applying…', async () => {
      if (!pendingMutation) return
      const ok = await getApi().confirmDestructive(
        `${pendingMutation.kind.toUpperCase()} ${pendingMutation.path}?`,
        pendingMutation.rationale,
      )
      if (!ok) {
        setPendingMutation(null)
        return
      }
      const result = await getApi().applyMutation(pendingMutation, true)
      if (!result.ok) throw new Error(result.error || 'Apply failed')
      store.setMutations(store.mutations.map((m) => (m.id === pendingMutation.id ? result.mutation : m)))
      const ws = await getApi().getWorkspace()
      if (ws) store.syncWorkspace(ws)
      setPendingMutation(null)
      toast.success('Applied')
    })

  const openSettings = async () => {
    setSettingsOpen(true)
    if (store.provider) {
      setSettingsProvider(store.provider.activeProvider)
      if (store.secretStatus[store.provider.activeProvider]) {
        await refreshModels(store.provider.activeProvider)
      }
    }
  }

  const saveSettings = () =>
    withBusy('Saving…', async () => {
      if (!store.provider) return
      const provider = settingsProvider
      const secrets: StoredSecrets = {}
      if (keyDraft.trim()) secrets[provider] = keyDraft.trim()
      if (Object.keys(secrets).length) {
        store.setSecretStatus(await getApi().saveSecrets(secrets))
        setKeyDraft('')
      }
      const list = await refreshModels(provider)
      const model =
        store.provider.activeProvider === provider && list.includes(store.provider.model)
          ? store.provider.model
          : list[0] || (await getApi().defaultModel(provider))
      const next: ProviderSettings = {
        activeProvider: provider,
        model,
        temperature: store.provider.temperature,
        maxTokens: store.provider.maxTokens,
      }
      await getApi().setProvider(next)
      store.setProvider(next)
      await getApi().setSetupComplete(true)
      const hasKey = await getApi().hasApiKey()
      store.setNeedsSetup(!hasKey)
      if (!hasKey) throw new Error('Save an API key to continue.')
      setSettingsOpen(false)
      toast.success(`${API_PROVIDERS.find((p) => p.id === provider)?.label} ready · ${model}`)
    })

  if (!bridgeReady) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--accent)]" />
          <h1 className="text-xl font-semibold">{APP_DISPLAY_NAME}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Starting…</p>
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
            <div className="text-sm font-semibold">{APP_DISPLAY_NAME}</div>
            <div className="text-[11px] text-[var(--muted)]">
              {store.provider
                ? `${store.provider.activeProvider} · ${store.provider.model}`
                : 'Add an API key to start'}
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
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
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          <CircleHelp className="h-4 w-4" />
          Help
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openSettings()}>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-[var(--border)] p-3">
            <Button variant="secondary" size="sm" className="w-full" onClick={onFolderIngest}>
              <FolderOpen className="h-4 w-4" />
              Open folder
            </Button>
            <Button variant="secondary" size="sm" className="w-full" onClick={() => store.setMode('github')}>
              <GitBranch className="h-4 w-4" />
              Clone GitHub
            </Button>
            <div className="flex gap-1">
              <Button
                size="sm"
                className="flex-1"
                disabled={!!store.busy || !store.selectedFileIds.length}
                onClick={onReview}
              >
                <Play className="h-3.5 w-3.5" />
                Review
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={!!store.busy || !store.selectedFileIds.length}
                onClick={onHumanize}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Humanize
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {store.workspace && (
              <div className="mb-2 px-1 text-xs text-[var(--muted)]">
                <div className="font-medium text-[var(--fg)]">{store.workspace.name}</div>
                <div>
                  {store.workspace.files.length} files · {store.workspace.kind}
                </div>
              </div>
            )}
            <FileTree
              files={store.workspace?.files ?? []}
              selectedIds={store.selectedFileIds}
              activeId={store.activePreviewId}
              onToggle={store.toggleFileSelection}
              onPreview={store.setActivePreviewId}
            />
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          {(store.mode === 'ingest' || store.mode === 'github') && (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
              <div className="border-b border-[var(--border)] p-4">
                {store.mode === 'github' ? (
                  <div className="mx-auto flex max-w-2xl flex-col gap-3">
                    <h2 className="text-lg font-semibold">Clone GitHub repo</h2>
                    <Input
                      placeholder="owner/repo or https://github.com/owner/repo"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="GitHub token (private repos only)"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                    />
                    <Button onClick={onGithubClone} disabled={!!store.busy}>
                      <GitBranch className="h-4 w-4" />
                      Clone
                    </Button>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-2xl flex-col gap-3">
                    <h2 className="text-lg font-semibold">
                      {store.workspace?.kind === 'paste' ? 'Add another paste' : 'Paste code or text'}
                    </h2>
                    <p className="text-sm text-[var(--muted)]">
                      Add files one at a time. Select up to {MAX_SELECTED_FILES} in the tree, then Review or Humanize —
                      each file runs as its own AI job.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[160px]">
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
                        Add to workspace
                      </Button>
                    </div>
                    <Textarea
                      className="min-h-[120px] font-mono text-sm"
                      placeholder="Paste here…"
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="min-h-0">
                {previewFile ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                      Preview · {previewFile.relativePath} · {labelForLanguage(previewFile.language)}
                    </div>
                    <div className="min-h-0 flex-1">
                      <Editor
                        height="100%"
                        theme="vs-dark"
                        language={monacoLanguage(previewFile.language)}
                        value={previewFile.content}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          automaticLayout: true,
                        }}
                        onChange={(value) => {
                          if (value === undefined) return
                          void getApi()
                            .updateFile(previewFile.id, value)
                            .then((ws) => ws && store.syncWorkspace(ws))
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                    Ingest files, then select them in the tree.
                  </div>
                )}
              </div>
            </div>
          )}

          {store.mode === 'review' && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Review</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Independent review per selected file ({selectedFiles.length} selected).
                  </p>
                </div>
                <Button onClick={onReview} disabled={!!store.busy || !store.selectedFileIds.length}>
                  <Play className="h-4 w-4" />
                  Run review
                </Button>
              </div>
              {!store.reviews.length && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                  Select files (max {MAX_SELECTED_FILES}), then run review.
                </div>
              )}
              {store.reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
                  <div className="mb-2 font-mono text-sm font-medium">{r.filePath}</div>
                  {r.error ? (
                    <p className="text-sm text-[var(--danger)]">{r.error}</p>
                  ) : (
                    <>
                      <div className="mb-2 text-xs text-[var(--muted)]">
                        {r.provider} · {r.model}
                      </div>
                      <p className="mb-3 text-sm">{r.summary}</p>
                      <div className="space-y-2">
                        {r.findings.map((f) => (
                          <div key={f.id} className="rounded-lg border border-[var(--border)] p-3">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <SeverityPill severity={f.severity} />
                              <span className="text-sm font-medium">{f.title}</span>
                            </div>
                            <p className="text-sm text-[var(--muted)]">{f.detail}</p>
                            {f.suggestion && (
                              <p className="mt-1 text-sm text-[var(--accent)]">Suggestion: {f.suggestion}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {store.mode === 'humanize' && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Humanize</h2>
                  <p className="text-sm text-[var(--muted)]">One AI pass per selected file. Confirm before apply.</p>
                </div>
                <Button onClick={onHumanize} disabled={!!store.busy || !store.selectedFileIds.length}>
                  <Wand2 className="h-4 w-4" />
                  Humanize selected
                </Button>
              </div>
              {!store.humanizeResults.length && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                  Select files, then humanize.
                </div>
              )}
              {store.humanizeResults.map((h) => (
                <div key={h.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-sm font-medium">{h.filePath}</div>
                    {!h.error && (
                      <Button size="sm" onClick={() => void applyHumanizeOne(h.fileId)}>
                        <Check className="h-3.5 w-3.5" />
                        Confirm & apply
                      </Button>
                    )}
                  </div>
                  {h.error ? (
                    <p className="text-sm text-[var(--danger)]">{h.error}</p>
                  ) : (
                    <div className="grid gap-2 lg:grid-cols-2">
                      <pre className="max-h-64 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs">{h.original}</pre>
                      <pre className="max-h-64 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs">{h.humanized}</pre>
                    </div>
                  )}
                  {!!h.notes.length && (
                    <p className="mt-2 text-xs text-[var(--muted)]">{h.notes.join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {store.mode === 'mutate' && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <h2 className="text-lg font-semibold">Propose edits</h2>
              <p className="text-sm text-[var(--muted)]">
                AI proposes changes to selected files. Nothing is written until you confirm.
              </p>
              <Textarea
                placeholder="e.g. Add null checks to the selected files"
                value={mutatePrompt}
                onChange={(e) => setMutatePrompt(e.target.value)}
              />
              <Button className="w-fit" onClick={onProposeMutations} disabled={!!store.busy}>
                Propose
              </Button>
              {store.mutations.map((m) => (
                <div key={m.id} className="rounded-xl border border-[var(--border)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <span className="rounded bg-[var(--surface-3)] px-2 py-0.5 text-[11px] uppercase">{m.kind}</span>
                    <span className="font-mono">{m.path}</span>
                    {m.applied && <span className="text-[var(--ok)]">Applied</span>}
                  </div>
                  <p className="mb-2 text-sm text-[var(--muted)]">{m.rationale}</p>
                  {m.after && (
                    <pre className="mb-3 max-h-40 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs">{m.after}</pre>
                  )}
                  <Button
                    size="sm"
                    variant={m.kind === 'delete' ? 'danger' : 'default'}
                    disabled={m.applied || !!store.busy}
                    onClick={() => setPendingMutation(m)}
                  >
                    {m.kind === 'delete' ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    Confirm & apply
                  </Button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <Dialog
        open={settingsOpen}
        onOpenChange={(open) => {
          if (!open && store.needsSetup) return
          setSettingsOpen(open)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{store.needsSetup ? 'Add your API key' : 'Models & keys'}</DialogTitle>
            <DialogDescription>
              Choose a provider, paste its API key, then pick a model. Keys stay on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Provider</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                value={settingsProvider}
                onChange={(e) => {
                  const p = e.target.value as ProviderId
                  setSettingsProvider(p)
                  setKeyDraft('')
                  setModels([])
                  if (store.secretStatus[p]) void refreshModels(p)
                }}
              >
                {API_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {store.secretStatus[p.id] ? ' · key saved' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>API key</Label>
              <Input
                className="mt-1"
                type="password"
                autoComplete="off"
                placeholder={store.secretStatus[settingsProvider] ? '•••••••• (unchanged)' : 'Paste API key'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingModels || (!keyDraft.trim() && !store.secretStatus[settingsProvider])}
              onClick={async () => {
                if (keyDraft.trim()) {
                  store.setSecretStatus(await getApi().saveSecrets({ [settingsProvider]: keyDraft.trim() }))
                  setKeyDraft('')
                }
                await refreshModels(settingsProvider)
              }}
            >
              {loadingModels ? 'Loading models…' : 'Load models'}
            </Button>
            {!!models.length && (
              <div>
                <Label>Model</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                  value={
                    store.provider?.activeProvider === settingsProvider
                      ? store.provider.model
                      : models[0]
                  }
                  onChange={(e) => {
                    if (!store.provider) return
                    store.setProvider({
                      ...store.provider,
                      activeProvider: settingsProvider,
                      model: e.target.value,
                    })
                  }}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button onClick={saveSettings} disabled={!!store.busy}>
              Save & continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Help & support</DialogTitle>
            <DialogDescription>
              PocketMind support for {APP_DISPLAY_NAME}. We respond to product questions, billing,
              and Store listing issues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Email</div>
              <div className="mt-1 font-medium">{SUPPORT_EMAIL}</div>
            </div>
            <p className="text-[var(--muted)]">
              Include your Windows version, app version, and a short description of what you need.
              API keys stay on your device — never paste keys into email.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void getApi()
                    .openExternal(SUPPORT_MAILTO)
                    .then(() => toast.success('Opening your email app…'))
                    .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
                }
              >
                <Mail className="h-4 w-4" />
                Email support
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void getApi()
                    .openExternal(PRIVACY_URL)
                    .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
                }
              >
                Privacy policy
              </Button>
              <Button variant="outline" onClick={() => setHelpOpen(false)}>
                Close
              </Button>
            </div>
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              Privacy: API keys and GitHub tokens are stored locally via the OS keychain (or an
              encrypted file fallback). Nothing is sent to PocketMind servers. AI features call only
              the provider you choose. Full policy:{' '}
              <button
                type="button"
                className="underline hover:text-[var(--fg)]"
                onClick={() => void getApi().openExternal(PRIVACY_URL)}
              >
                noumanshakeil.github.io/#privacy-policy
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMutation} onOpenChange={(o) => !o && setPendingMutation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm change</DialogTitle>
            <DialogDescription>
              {pendingMutation ? `${pendingMutation.kind} ${pendingMutation.path}` : ''}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[var(--muted)]">{pendingMutation?.rationale}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingMutation(null)}>
              Cancel
            </Button>
            <Button onClick={doApplyMutation}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster theme="dark" richColors position="bottom-right" />
    </div>
  )
}
