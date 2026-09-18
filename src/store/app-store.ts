import { create } from 'zustand'
import type {
  AppMode,
  HumanizeResult,
  ProposedMutation,
  ProviderSettings,
  ReviewResult,
  WorkspaceSnapshot,
} from '@/shared/types'

interface AppState {
  mode: AppMode
  workspace: WorkspaceSnapshot | null
  selectedFileId: string | null
  review: ReviewResult | null
  humanize: HumanizeResult | null
  mutations: ProposedMutation[]
  busy: string | null
  error: string | null
  provider: ProviderSettings | null
  secretStatus: Record<string, boolean>
  setMode: (mode: AppMode) => void
  setWorkspace: (workspace: WorkspaceSnapshot | null) => void
  /** Update file contents without treating it as a brand-new ingest (keeps selection). */
  syncWorkspace: (workspace: WorkspaceSnapshot) => void
  setSelectedFileId: (id: string | null) => void
  setReview: (review: ReviewResult | null) => void
  setHumanize: (humanize: HumanizeResult | null) => void
  setMutations: (mutations: ProposedMutation[]) => void
  setBusy: (busy: string | null) => void
  setError: (error: string | null) => void
  setProvider: (provider: ProviderSettings | null) => void
  setSecretStatus: (status: Record<string, boolean>) => void
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'ingest',
  workspace: null,
  selectedFileId: null,
  review: null,
  humanize: null,
  mutations: [],
  busy: null,
  error: null,
  provider: null,
  secretStatus: {},
  setMode: (mode) => set({ mode }),
  setWorkspace: (workspace) =>
    set({
      workspace,
      selectedFileId: workspace?.files[0]?.id ?? null,
      review: null,
      humanize: null,
      mutations: [],
    }),
  syncWorkspace: (workspace) =>
    set((state) => ({
      workspace,
      selectedFileId:
        workspace.files.some((f) => f.id === state.selectedFileId) ? state.selectedFileId : workspace.files[0]?.id ?? null,
    })),
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
  setReview: (review) => set({ review }),
  setHumanize: (humanize) => set({ humanize }),
  setMutations: (mutations) => set({ mutations }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setProvider: (provider) => set({ provider }),
  setSecretStatus: (secretStatus) => set({ secretStatus }),
}))
