import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'
import type { TerminalStatus } from '@/hooks/use-terminal-ws'

interface TerminalStatusBarProps {
  name: string
  status: TerminalStatus
  exitCode?: number
  className?: string
  onRename?: (name: string) => void
}

export function TerminalStatusBar({
  name,
  status,
  exitCode,
  className,
  onRename,
}: TerminalStatusBarProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    if (onRename) {
      setEditValue(name)
      setIsEditing(true)
    }
  }

  const handleRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== name && onRename) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div
      className={cn(
        'flex h-6 items-center gap-2 border-b border-border bg-card px-2 text-xs',
        className
      )}
    >
      {/* Status indicator */}
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', {
          'bg-accent': status === 'running',
          'bg-muted-foreground': status === 'exited' && exitCode === 0,
          'bg-destructive': (status === 'exited' && exitCode !== 0) || status === 'error',
        })}
      />

      {/* Name */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={handleKeyDown}
          className="h-4 w-24 rounded border border-border bg-background px-1 text-xs font-medium text-foreground outline-none focus:border-primary"
        />
      ) : (
        <span
          className={cn(
            'font-medium text-foreground',
            onRename && 'cursor-pointer hover:text-primary'
          )}
          onDoubleClick={handleDoubleClick}
          title={onRename ? 'Double-click to rename' : undefined}
        >
          {name}
        </span>
      )}

      {/* Exit code if applicable */}
      {status === 'exited' && exitCode !== undefined && (
        <>
          <span className="ml-auto text-muted-foreground">·</span>
          <span
            className={cn({
              'text-muted-foreground': exitCode === 0,
              'text-destructive': exitCode !== 0,
            })}
          >
            exit {exitCode}
          </span>
        </>
      )}
    </div>
  )
}
