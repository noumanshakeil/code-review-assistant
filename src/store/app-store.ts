import { create } from 'zustand'
import type {
  AppMode,
  HumanizeResult,
  ProposedMutation,
  ProviderSettings,
  ReviewResult,
  WorkspaceSnapshot,
} from '@/shared/types'
import { MAX_SELECTED_FILES } from '@/shared/types'

interface AppState {
  mode: AppMode
  workspace: WorkspaceSnapshot | null
  selectedFileIds: string[]
  activePreviewId: string | null
  reviews: ReviewResult[]
  humanizeResults: HumanizeResult[]
  mutations: ProposedMutation[]
  busy: string | null
  error: string | null
  provider: ProviderSettings | null
  secretStatus: Record<string, boolean>
  needsSetup: boolean
  setMode: (mode: AppMode) => void
  setWorkspace: (workspace: WorkspaceSnapshot | null) => void
  syncWorkspace: (workspace: WorkspaceSnapshot) => void
  toggleFileSelection: (id: string) => void
  setSelectedFileIds: (ids: string[]) => void
  setActivePreviewId: (id: string | null) => void
  setReviews: (reviews: ReviewResult[]) => void
  setHumanizeResults: (results: HumanizeResult[]) => void
  setMutations: (mutations: ProposedMutation[]) => void
  setBusy: (busy: string | null) => void
  setError: (error: string | null) => void
  setProvider: (provider: ProviderSettings | null) => void
  setSecretStatus: (status: Record<string, boolean>) => void
  setNeedsSetup: (needs: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'ingest',
  workspace: null,
  selectedFileIds: [],
  activePreviewId: null,
  reviews: [],
  humanizeResults: [],
  mutations: [],
  busy: null,
  error: null,
  provider: null,
  secretStatus: {},
  needsSetup: false,
  setMode: (mode) => set({ mode }),
  setWorkspace: (workspace) =>
    set({
      workspace,
      selectedFileIds: workspace?.files.slice(0, 1).map((f) => f.id) ?? [],
      activePreviewId: workspace?.files[0]?.id ?? null,
      reviews: [],
      humanizeResults: [],
      mutations: [],
    }),
  syncWorkspace: (workspace) =>
    set((state) => {
      const still = state.selectedFileIds.filter((id) => workspace.files.some((f) => f.id === id))
      return {
        workspace,
        selectedFileIds: still.length ? still : workspace.files.slice(0, 1).map((f) => f.id),
        activePreviewId:
          workspace.files.some((f) => f.id === state.activePreviewId)
            ? state.activePreviewId
            : workspace.files[0]?.id ?? null,
      }
    }),
  toggleFileSelection: (id) => {
    const { selectedFileIds } = get()
    if (selectedFileIds.includes(id)) {
      set({ selectedFileIds: selectedFileIds.filter((x) => x !== id), activePreviewId: id })
      return
    }
    if (selectedFileIds.length >= MAX_SELECTED_FILES) return
    set({ selectedFileIds: [...selectedFileIds, id], activePreviewId: id })
  },
  setSelectedFileIds: (ids) => set({ selectedFileIds: ids.slice(0, MAX_SELECTED_FILES) }),
  setActivePreviewId: (activePreviewId) => set({ activePreviewId }),
  setReviews: (reviews) => set({ reviews }),
  setHumanizeResults: (humanizeResults) => set({ humanizeResults }),
  setMutations: (mutations) => set({ mutations }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setProvider: (provider) => set({ provider }),
  setSecretStatus: (secretStatus) => set({ secretStatus }),
  setNeedsSetup: (needsSetup) => set({ needsSetup }),
}))
