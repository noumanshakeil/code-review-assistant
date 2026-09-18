import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileCode2, Folder } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { labelForLanguage } from '@/lib/languages'
import type { CodeFile } from '@/shared/types'
import { MAX_SELECTED_FILES } from '@/shared/types'

type TreeNode =
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }
  | { type: 'file'; name: string; path: string; file: CodeFile }

function buildTree(files: CodeFile[]): TreeNode[] {
  const root: TreeNode[] = []

  function ensureDir(nodes: TreeNode[], name: string, fullPath: string): Extract<TreeNode, { type: 'dir' }> {
    let dir = nodes.find((n) => n.type === 'dir' && n.name === name) as Extract<TreeNode, { type: 'dir' }> | undefined
    if (!dir) {
      dir = { type: 'dir', name, path: fullPath, children: [] }
      nodes.push(dir)
    }
    return dir
  }

  for (const file of files) {
    const parts = file.relativePath.split('/').filter(Boolean)
    let cursor = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      acc = acc ? `${acc}/${part}` : part
      if (i === parts.length - 1) {
        cursor.push({ type: 'file', name: part, path: acc, file })
      } else {
        const dir = ensureDir(cursor, part, acc)
        cursor = dir.children
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.type === 'dir') sortNodes(n.children)
  }
  sortNodes(root)
  return root
}

function TreeItem({
  node,
  depth,
  selectedIds,
  activeId,
  onToggle,
  onPreview,
}: {
  node: TreeNode
  depth: number
  selectedIds: string[]
  activeId: string | null
  onToggle: (id: string) => void
  onPreview: (id: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  if (node.type === 'dir') {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Folder className="h-3.5 w-3.5" />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              activeId={activeId}
              onToggle={onToggle}
              onPreview={onPreview}
            />
          ))}
      </div>
    )
  }

  const selected = selectedIds.includes(node.file.id)
  const active = activeId === node.file.id
  const atCap = !selected && selectedIds.length >= MAX_SELECTED_FILES

  return (
    <div
      className={cn(
        'flex w-full items-start gap-1.5 rounded px-1 py-1 text-left text-xs',
        active ? 'bg-[var(--surface-3)] text-[var(--fg)]' : 'text-[var(--muted)] hover:bg-[var(--surface-2)]',
        atCap && 'opacity-50',
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={selected}
        disabled={atCap}
        onChange={() => onToggle(node.file.id)}
        title={atCap ? `Select at most ${MAX_SELECTED_FILES} files` : 'Select for Review / Humanize'}
      />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPreview(node.file.id)}>
        <span className="flex items-start gap-1">
          <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-mono">{node.name}</span>
            <span className="text-[10px] opacity-70">
              {labelForLanguage(node.file.language)} · {formatBytes(node.file.size)}
            </span>
          </span>
        </span>
      </button>
    </div>
  )
}

export function FileTree({
  files,
  selectedIds,
  activeId,
  onToggle,
  onPreview,
}: {
  files: CodeFile[]
  selectedIds: string[]
  activeId: string | null
  onToggle: (id: string) => void
  onPreview: (id: string) => void
}) {
  const tree = useMemo(() => buildTree(files), [files])
  if (!files.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
        No files yet. Paste, open a folder, or clone a repo.
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      <div className="mb-2 px-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
        Selected {selectedIds.length}/{MAX_SELECTED_FILES}
      </div>
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedIds={selectedIds}
          activeId={activeId}
          onToggle={onToggle}
          onPreview={onPreview}
        />
      ))}
    </div>
  )
}
