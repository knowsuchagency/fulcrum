import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatShortcut } from '@/lib/keyboard'
import { useHotkeys } from '@/hooks/use-hotkeys'
import {
  type Command,
  searchCommands,
  groupCommandsByCategory,
  categoryLabels,
} from './command-registry'
import { useTerminalViewState } from '@/hooks/use-terminal-view-state'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  GridViewIcon,
  CommandLineIcon,
  FolderSyncIcon,
  Database01Icon,
  Settings01Icon,
  PlusSignIcon,
  HelpCircleIcon,
} from '@hugeicons/core-free-icons'

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNewTask?: () => void
  onShowShortcuts?: () => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange, onNewTask, onShowShortcuts }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { setActiveTab } = useTerminalViewState()

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      {
        id: 'goto-tasks',
        label: 'Go to Tasks',
        shortcut: 'meta+1',
        keywords: ['kanban', 'board', 'home'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/tasks' })
          setOpen(false)
        },
      },
      {
        id: 'goto-terminals',
        label: 'Go to Terminals',
        shortcut: 'meta+2',
        keywords: ['shell', 'console', 'cli'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={CommandLineIcon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/terminals' })
          setOpen(false)
        },
      },
      {
        id: 'goto-task-terminals',
        label: 'Go to Task Terminals',
        shortcut: 'meta+i',
        keywords: ['tasks', 'shell', 'console', 'cli'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={2} />,
        action: () => {
          setActiveTab('all-tasks')
          navigate({ to: '/terminals' })
          setOpen(false)
        },
      },
      {
        id: 'goto-worktrees',
        label: 'Go to Worktrees',
        shortcut: 'meta+3',
        keywords: ['git', 'branches'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={FolderSyncIcon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/worktrees' })
          setOpen(false)
        },
      },
      {
        id: 'goto-repositories',
        label: 'Go to Repositories',
        shortcut: 'meta+4',
        keywords: ['repos', 'git', 'projects'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={Database01Icon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/repositories' })
          setOpen(false)
        },
      },
      {
        id: 'goto-settings',
        label: 'Go to Settings',
        shortcut: 'meta+,',
        keywords: ['preferences', 'config', 'configuration'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/settings' })
          setOpen(false)
        },
      },
      {
        id: 'new-task',
        label: 'New Task',
        shortcut: 'meta+j',
        keywords: ['create', 'add'],
        category: 'actions',
        icon: <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />,
        action: () => {
          setOpen(false)
          onNewTask?.()
        },
      },
      {
        id: 'show-shortcuts',
        label: 'Keyboard Shortcuts',
        shortcut: 'meta+/',
        keywords: ['help', 'hotkeys', 'keys'],
        category: 'actions',
        icon: <HugeiconsIcon icon={HelpCircleIcon} size={16} strokeWidth={2} />,
        action: () => {
          setOpen(false)
          onShowShortcuts?.()
        },
      },
    ]
    return cmds
  }, [navigate, onNewTask, onShowShortcuts, setActiveTab])

  // Filter commands based on query
  const filteredCommands = useMemo(
    () => searchCommands(commands, query),
    [commands, query]
  )

  // Group filtered commands by category
  const groupedCommands = useMemo(
    () => groupCommandsByCategory(filteredCommands),
    [filteredCommands]
  )

  // Flatten grouped commands for index-based selection
  const flattenedCommands = useMemo(() => {
    const result: Command[] = []
    // Order: navigation first, then actions
    const order: Command['category'][] = ['navigation', 'actions']
    for (const cat of order) {
      const cmds = groupedCommands.get(cat)
      if (cmds) result.push(...cmds)
    }
    return result
  }, [groupedCommands])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedElement = listRef.current.querySelector('[data-selected="true"]')
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Open command palette
  useHotkeys('meta+k', () => setOpen(true), { allowInInput: true })

  // Navigation shortcuts
  useHotkeys('meta+1', () => navigate({ to: '/tasks' }), { allowInInput: true })
  useHotkeys('meta+2', () => navigate({ to: '/terminals' }), { allowInInput: true })
  useHotkeys('meta+i', () => {
    setActiveTab('all-tasks')
    navigate({ to: '/terminals' })
  }, { allowInInput: true })
  useHotkeys('meta+3', () => navigate({ to: '/worktrees' }), { allowInInput: true })
  useHotkeys('meta+4', () => navigate({ to: '/repositories' }), { allowInInput: true })
  useHotkeys('meta+,', () => navigate({ to: '/settings' }), { allowInInput: true })

  // New task shortcut
  useHotkeys(
    'meta+j',
    () => {
      onNewTask?.()
    },
    { allowInInput: false, deps: [onNewTask] }
  )

  // Help shortcut (Cmd+/)
  useHotkeys(
    'meta+/',
    () => {
      onShowShortcuts?.()
    },
    { allowInInput: true, deps: [onShowShortcuts] }
  )

  // Handle keyboard navigation in the palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, flattenedCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flattenedCommands[selectedIndex]) {
            flattenedCommands[selectedIndex].action()
          }
          break
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
      }
    },
    [flattenedCommands, selectedIndex]
  )

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Track current index for rendering
  let currentIndex = 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-lg p-0 gap-0 overflow-hidden"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-border px-3">
          <span className="text-muted-foreground mr-2">&gt;</span>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-12"
          />
          <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No commands found.
            </div>
          ) : (
            <>
              {(['navigation', 'actions'] as const).map((category) => {
                const cmds = groupedCommands.get(category)
                if (!cmds || cmds.length === 0) return null

                return (
                  <div key={category} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {categoryLabels[category]}
                    </div>
                    {cmds.map((command) => {
                      const index = currentIndex++
                      const isSelected = index === selectedIndex

                      return (
                        <button
                          key={command.id}
                          data-selected={isSelected}
                          onClick={() => command.action()}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm',
                            isSelected
                              ? 'bg-accent text-accent-foreground'
                              : 'text-foreground hover:bg-accent/50'
                          )}
                        >
                          {command.icon && (
                            <span className="text-muted-foreground">{command.icon}</span>
                          )}
                          <span className="flex-1 text-left">{command.label}</span>
                          {command.shortcut && (
                            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                              {formatShortcut(command.shortcut)}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
