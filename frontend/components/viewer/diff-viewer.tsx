import { useEffect, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, ArrowDown01Icon, MenuCollapseIcon, UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
      // Extract file path from "diff --git a/path b/path"
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

interface FileDiffSectionProps {
  file: FileDiff
  wrap: boolean
  isCollapsed: boolean
  onToggle: () => void
}

function FileDiffSection({ file, wrap, isCollapsed, onToggle }: FileDiffSectionProps) {
  return (
    <Collapsible open={!isCollapsed} onOpenChange={() => onToggle()}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 px-2 py-1.5 bg-card border-b border-border cursor-pointer hover:bg-muted select-none">
          <HugeiconsIcon
            icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className="text-muted-foreground shrink-0"
          />
          <span className="font-mono text-xs text-foreground truncate flex-1">
            {file.path}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {file.additions > 0 && (
              <span className="text-accent">+{file.additions}</span>
            )}
            {file.additions > 0 && file.deletions > 0 && ' '}
            {file.deletions > 0 && (
              <span className="text-destructive">-{file.deletions}</span>
            )}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="font-mono text-xs">
          {file.lines.slice(1).map((line, i) => (
            <div
              key={i}
              className={cn(
                'flex px-2 py-0.5',
                line.type === 'added' && 'bg-accent/10',
                line.type === 'removed' && 'bg-destructive/10',
                line.type === 'header' && 'bg-muted/50 text-muted-foreground',
                line.type === 'hunk' && 'bg-accent/10 text-accent'
              )}
            >
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
              <span
                className={cn(
                  'w-4 shrink-0 select-none text-center',
                  line.type === 'added' && 'text-accent',
                  line.type === 'removed' && 'text-destructive'
                )}
              >
                {line.type === 'added' && '+'}
                {line.type === 'removed' && '-'}
              </span>
              <span
                className={cn(
                  'flex-1',
                  wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                  line.type === 'added' && 'text-accent',
                  line.type === 'removed' && 'text-destructive'
                )}
              >
                {line.content}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface DiffViewerProps {
  taskId: string
  worktreePath: string | null
}

export function DiffViewer({ taskId, worktreePath }: DiffViewerProps) {
  const { options, setOption, toggleFileCollapse, collapseAll, expandAll, isFileCollapsed } = useDiffOptions(taskId)
  const { wrap, ignoreWhitespace, includeUntracked, collapsedFiles } = options
  const { data, isLoading, error } = useGitDiff(worktreePath, { ignoreWhitespace, includeUntracked })

  const files = useMemo(() => {
    if (!data?.diff) return []
    return parseDiff(data.diff)
  }, [data?.diff])

  const allFilePaths = useMemo(() => files.map(f => f.path), [files])
  const allCollapsed = files.length > 0 && collapsedFiles.length === files.length
  const totalAdditions = useMemo(() => files.reduce((sum, f) => sum + f.additions, 0), [files])
  const totalDeletions = useMemo(() => files.reduce((sum, f) => sum + f.deletions, 0), [files])

  // Keyboard shortcut: Shift+C to toggle collapse/expand all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'C' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't trigger if user is typing in an input
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
                    f.status === 'added' && 'text-accent',
                    f.status === 'deleted' && 'text-destructive',
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
            {data.isBranchDiff && <span className="opacity-70"> (vs master)</span>}
          </span>
        )}
        {(totalAdditions > 0 || totalDeletions > 0) && (
          <span className="text-muted-foreground">
            <span className="text-accent">+{totalAdditions}</span>
            {' '}
            <span className="text-destructive">-{totalDeletions}</span>
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

      <ScrollArea className="flex-1 min-h-0">
        {files.map((file) => (
          <FileDiffSection
            key={file.path}
            file={file}
            wrap={wrap}
            isCollapsed={isFileCollapsed(file.path)}
            onToggle={() => toggleFileCollapse(file.path)}
          />
        ))}
      </ScrollArea>
    </div>
  )
}
