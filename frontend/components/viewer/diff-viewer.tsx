import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, ArrowDown01Icon, MenuCollapseIcon, UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { useGitDiff } from '@/hooks/use-filesystem'
import { useDiffOptions } from '@/hooks/use-diff-options'
import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'header' | 'hunk' | 'added' | 'removed' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

interface FileDiff {
  path: string
  lines: DiffLine[]
  additions: number
  deletions: number
}

function parseDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = []
  let currentFile: FileDiff | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+?) b\//)
      const path = match?.[1] ?? 'unknown'
      currentFile = { path, lines: [], additions: 0, deletions: 0 }
      files.push(currentFile)
      currentFile.lines.push({ type: 'header', content: line })
    } else if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      currentFile?.lines.push({ type: 'header', content: line })
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      currentFile?.lines.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      if (currentFile) {
        currentFile.additions++
        currentFile.lines.push({
          type: 'added',
          content: line.slice(1),
          newLineNumber: newLine++,
        })
      }
    } else if (line.startsWith('-')) {
      if (currentFile) {
        currentFile.deletions++
        currentFile.lines.push({
          type: 'removed',
          content: line.slice(1),
          oldLineNumber: oldLine++,
        })
      }
    } else if (line.startsWith(' ')) {
      currentFile?.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      })
    }
  }

  return files
}

// ── Pre-computed class strings to avoid cn() calls per row ──

const ROW_BASE = 'flex px-2 py-0.5'
const ROW_CLASSES: Record<DiffLine['type'], string> = {
  added: `${ROW_BASE} bg-diff-add-bg`,
  removed: `${ROW_BASE} bg-diff-remove-bg`,
  header: `${ROW_BASE} bg-muted/50 text-muted-foreground`,
  hunk: `${ROW_BASE} bg-diff-add-bg/50 text-diff-add-fg`,
  context: ROW_BASE,
}

const SIGN_BASE = 'w-4 shrink-0 select-none text-center'
const SIGN_CLASSES: Record<string, string> = {
  added: `${SIGN_BASE} text-diff-add-fg`,
  removed: `${SIGN_BASE} text-diff-remove-fg`,
  other: SIGN_BASE,
}

function getContentClass(type: DiffLine['type'], wrap: boolean): string {
  const base = wrap ? 'flex-1 whitespace-pre-wrap break-all' : 'flex-1 whitespace-pre'
  if (type === 'added') return `${base} text-diff-add-fg`
  if (type === 'removed') return `${base} text-diff-remove-fg`
  return base
}

// ── Flat row types for the virtual list ──

type FlatRow =
  | { kind: 'file-header'; file: FileDiff; collapsed: boolean }
  | { kind: 'diff-line'; line: DiffLine }

const FILE_HEADER_HEIGHT = 32
const DIFF_LINE_HEIGHT = 22

interface DiffViewerProps {
  taskId: string
  worktreePath: string | null
  baseBranch?: string
}

export function DiffViewer({ taskId, worktreePath, baseBranch }: DiffViewerProps) {
  const { options, setOption, toggleFileCollapse, collapseAll, expandAll } = useDiffOptions(taskId)
  const { wrap, ignoreWhitespace, includeUntracked, collapsedFiles } = options
  const { data, isLoading, error } = useGitDiff(worktreePath, { ignoreWhitespace, includeUntracked, baseBranch })

  const files = useMemo(() => {
    if (!data?.diff) return []
    return parseDiff(data.diff)
  }, [data?.diff])

  const collapsedSet = useMemo(() => new Set(collapsedFiles), [collapsedFiles])

  const allFilePaths = useMemo(() => files.map(f => f.path), [files])
  const allCollapsed = files.length > 0 && collapsedFiles.length === files.length
  const totalAdditions = useMemo(() => files.reduce((sum, f) => sum + f.additions, 0), [files])
  const totalDeletions = useMemo(() => files.reduce((sum, f) => sum + f.deletions, 0), [files])

  // Build the flat row list — file headers + expanded file lines
  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    for (const file of files) {
      const collapsed = collapsedSet.has(file.path)
      rows.push({ kind: 'file-header', file, collapsed })
      if (!collapsed) {
        // Skip the first header line (the "diff --git" line) — info is in the file header row
        for (let i = 1; i < file.lines.length; i++) {
          rows.push({ kind: 'diff-line', line: file.lines[i] })
        }
      }
    }
    return rows
  }, [files, collapsedSet])

  // Virtualizer
  const scrollRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      flatRows[index].kind === 'file-header' ? FILE_HEADER_HEIGHT : DIFF_LINE_HEIGHT,
    overscan: 40,
  })

  // Keyboard shortcut: Shift+C to toggle collapse/expand all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'C' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }
        e.preventDefault()
        if (allCollapsed) {
          expandAll()
        } else {
          collapseAll(allFilePaths)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allCollapsed, allFilePaths, collapseAll, expandAll])

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No worktree selected
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading diff...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        {error.message}
      </div>
    )
  }

  const hasUntrackedFiles = data?.files?.some(f => f.status === 'untracked') ?? false

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground text-sm gap-2">
        <p>No changes detected</p>
        {data?.files && data.files.length > 0 && (
          <div className="text-xs">
            <p className="text-center mb-2">Modified files:</p>
            <div className="flex flex-col gap-1">
              {data.files.map((f) => (
                <div key={f.path} className="flex gap-2">
                  <span className={cn(
                    'w-4 text-center',
                    f.status === 'added' && 'text-diff-add-fg',
                    f.status === 'deleted' && 'text-diff-remove-fg',
                    f.status === 'modified' && 'text-muted-foreground',
                    f.status === 'untracked' && 'text-muted-foreground'
                  )}>
                    {f.status === 'added' && 'A'}
                    {f.status === 'deleted' && 'D'}
                    {f.status === 'modified' && 'M'}
                    {f.status === 'untracked' && '?'}
                  </span>
                  <span>{f.path}</span>
                </div>
              ))}
              {hasUntrackedFiles && (
                <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground mt-1">
                  <input
                    type="checkbox"
                    checked={includeUntracked}
                    onChange={(e) => setOption('includeUntracked', e.target.checked)}
                    className="w-4 h-3"
                  />
                  <span>Show untracked files</span>
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-card border-b border-border text-xs">
        {data?.branch && (
          <span className="text-muted-foreground">
            {data.branch}
            {data.isBranchDiff && data.baseBranch && <span className="opacity-70"> (vs {data.baseBranch})</span>}
          </span>
        )}
        {(totalAdditions > 0 || totalDeletions > 0) && (
          <span className="text-muted-foreground">
            <span className="text-diff-add-fg">+{totalAdditions}</span>
            {' '}
            <span className="text-diff-remove-fg">-{totalDeletions}</span>
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => allCollapsed ? expandAll() : collapseAll(allFilePaths)}
          className="flex items-center gap-1 px-1.5 py-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
          title={allCollapsed ? 'Expand all (Shift+C)' : 'Collapse all (Shift+C)'}
        >
          <HugeiconsIcon
            icon={allCollapsed ? UnfoldMoreIcon : MenuCollapseIcon}
            size={12}
            strokeWidth={2}
          />
          <span className="hidden sm:inline">{allCollapsed ? 'Expand' : 'Collapse'}</span>
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => setOption('wrap', e.target.checked)}
            className="w-3 h-3"
          />
          Wrap
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => setOption('ignoreWhitespace', e.target.checked)}
            className="w-3 h-3"
          />
          Ignore whitespace
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={includeUntracked}
            onChange={(e) => setOption('includeUntracked', e.target.checked)}
            className="w-3 h-3"
          />
          Untracked
        </label>
      </div>

      {/* Virtualized diff content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="relative w-full font-mono text-xs"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index]

            if (row.kind === 'file-header') {
              const { file, collapsed } = row
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 w-full"
                  style={{ top: virtualRow.start }}
                >
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 bg-card border-b border-border cursor-pointer hover:bg-muted select-none"
                    onClick={() => toggleFileCollapse(file.path)}
                  >
                    <HugeiconsIcon
                      icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
                      size={12}
                      strokeWidth={2}
                      className="text-muted-foreground shrink-0"
                    />
                    <span className="font-mono text-xs text-foreground truncate flex-1">
                      {file.path}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {file.additions > 0 && (
                        <span className="text-diff-add-fg">+{file.additions}</span>
                      )}
                      {file.additions > 0 && file.deletions > 0 && ' '}
                      {file.deletions > 0 && (
                        <span className="text-diff-remove-fg">-{file.deletions}</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            }

            const { line } = row
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 w-full"
                style={{ top: virtualRow.start }}
              >
                <div className={ROW_CLASSES[line.type]}>
                  {(line.type === 'added' ||
                    line.type === 'removed' ||
                    line.type === 'context') && (
                    <>
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">
                        {line.oldLineNumber ?? ''}
                      </span>
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">
                        {line.newLineNumber ?? ''}
                      </span>
                    </>
                  )}
                  <span className={SIGN_CLASSES[line.type] ?? SIGN_CLASSES.other}>
                    {line.type === 'added' && '+'}
                    {line.type === 'removed' && '-'}
                  </span>
                  <span className={getContentClass(line.type, wrap)}>
                    {line.content}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
