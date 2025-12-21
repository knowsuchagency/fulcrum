import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGitDiff } from '@/hooks/use-filesystem'
import { useDiffOptions } from '@/hooks/use-diff-options'
import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'header' | 'hunk' | 'added' | 'removed' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

function parseDiff(diffText: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git')) {
      lines.push({ type: 'header', content: line })
    } else if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'header', content: line })
    } else if (line.startsWith('@@')) {
      // Parse hunk header like @@ -1,5 +1,7 @@
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      lines.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      lines.push({
        type: 'added',
        content: line.slice(1),
        newLineNumber: newLine++,
      })
    } else if (line.startsWith('-')) {
      lines.push({
        type: 'removed',
        content: line.slice(1),
        oldLineNumber: oldLine++,
      })
    } else if (line.startsWith(' ')) {
      lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      })
    }
  }

  return lines
}

interface DiffViewerProps {
  taskId: string
  worktreePath: string | null
}

export function DiffViewer({ taskId, worktreePath }: DiffViewerProps) {
  const { options, setOption } = useDiffOptions(taskId)
  const { wrap, ignoreWhitespace, includeUntracked } = options
  const { data, isLoading, error } = useGitDiff(worktreePath, { ignoreWhitespace, includeUntracked })

  const lines = useMemo(() => {
    if (!data?.diff) return []
    return parseDiff(data.diff)
  }, [data?.diff])

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

  if (lines.length === 0) {
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
                    f.status === 'added' && 'text-green-500',
                    f.status === 'deleted' && 'text-red-500',
                    f.status === 'modified' && 'text-yellow-500',
                    f.status === 'untracked' && 'text-gray-500'
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-muted/50 border-b border-border text-xs">
        {data?.branch && (
          <span className="text-muted-foreground">
            {data.branch}
            {data.isBranchDiff && <span className="opacity-70"> (vs master)</span>}
          </span>
        )}
        <div className="flex-1" />
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

      <ScrollArea className="flex-1">
        <div className="font-mono text-xs">

        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex px-2 py-0.5',
              line.type === 'added' && 'bg-green-500/10',
              line.type === 'removed' && 'bg-red-500/10',
              line.type === 'header' && 'bg-muted/50 text-muted-foreground',
              line.type === 'hunk' && 'bg-blue-500/10 text-blue-400'
            )}
          >
            {/* Line numbers */}
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

            {/* Sign indicator */}
            <span
              className={cn(
                'w-4 shrink-0 select-none text-center',
                line.type === 'added' && 'text-green-500',
                line.type === 'removed' && 'text-red-500'
              )}
            >
              {line.type === 'added' && '+'}
              {line.type === 'removed' && '-'}
            </span>

            {/* Content */}
            <span
              className={cn(
                'flex-1',
                wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                line.type === 'added' && 'text-green-400',
                line.type === 'removed' && 'text-red-400'
              )}
            >
              {line.content}
            </span>
          </div>
        ))}
        </div>
      </ScrollArea>
    </div>
  )
}
