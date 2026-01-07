import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatShortcut } from '@/lib/keyboard'
import { useHotkeys } from '@/hooks/use-hotkeys'
import {
  type Command,
  searchCommands,
  groupCommandsByCategory,
} from './command-registry'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  GridViewIcon,
  CommandLineIcon,
  Folder01Icon,
  Settings01Icon,
  PlusSignIcon,
  HelpCircleIcon,
  GitPullRequestIcon,
  ChartLineData01Icon,
  CodeIcon,
} from '@hugeicons/core-free-icons'

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNewTask?: () => void
  onShowShortcuts?: () => void
  onOpenInEditor?: () => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange, onNewTask, onShowShortcuts, onOpenInEditor }: CommandPaletteProps) {
  const { t } = useTranslation('navigation')
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      {
        id: 'goto-tasks',
        label: t('commandPalette.commands.goToTasks'),
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
        label: t('commandPalette.commands.goToTerminals'),
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
        id: 'goto-projects',
        label: t('commandPalette.commands.goToProjects'),
        shortcut: 'meta+3',
        keywords: ['repos', 'repositories', 'apps', 'deploy', 'docker'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/projects' })
          setOpen(false)
        },
      },
      {
        id: 'goto-review',
        label: t('commandPalette.commands.goToReview'),
        shortcut: 'meta+4',
        keywords: ['pr', 'pull request', 'issues', 'github'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={GitPullRequestIcon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/review' })
          setOpen(false)
        },
      },
      {
        id: 'goto-monitoring',
        label: t('commandPalette.commands.goToMonitoring'),
        shortcut: 'meta+5',
        keywords: ['system', 'cpu', 'memory', 'processes', 'usage'],
        category: 'navigation',
        icon: <HugeiconsIcon icon={ChartLineData01Icon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/monitoring' })
          setOpen(false)
        },
      },
      {
        id: 'goto-settings',
        label: t('commandPalette.commands.goToSettings'),
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
        label: t('commandPalette.commands.newTask'),
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
        id: 'open-in-editor',
        label: t('commandPalette.commands.openInEditor'),
        shortcut: 'meta+e',
        keywords: ['editor', 'code', 'vscode', 'cursor', 'folder', 'path'],
        category: 'actions',
        icon: <HugeiconsIcon icon={CodeIcon} size={16} strokeWidth={2} />,
        action: () => {
          setOpen(false)
          onOpenInEditor?.()
        },
      },
      {
        id: 'show-shortcuts',
        label: t('commandPalette.commands.keyboardShortcuts'),
        shortcut: 'meta+/',
        keywords: ['help', 'hotkeys', 'keys'],
        category: 'actions',
        icon: <HugeiconsIcon icon={HelpCircleIcon} size={16} strokeWidth={2} />,
        action: () => {
          setOpen(false)
          onShowShortcuts?.()
        },
      },
      {
        id: 'goto-task-terminals',
        label: t('commandPalette.commands.goToTaskTerminals'),
        shortcut: 'meta+u',
        keywords: ['tasks', 'shell', 'console', 'cli'],
        category: 'actions',
        icon: <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/terminals', search: { tab: 'all-tasks' } })
          setOpen(false)
        },
      },
      {
        id: 'goto-project-terminals',
        label: t('commandPalette.commands.goToProjectTerminals'),
        shortcut: 'meta+i',
        keywords: ['projects', 'shell', 'console', 'cli', 'workspace'],
        category: 'actions',
        icon: <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={2} />,
        action: () => {
          navigate({ to: '/terminals', search: (prev) => ({ ...prev, tab: 'all-projects' }) })
          setOpen(false)
        },
      },
    ]
    return cmds
  }, [navigate, onNewTask, onShowShortcuts, onOpenInEditor, setOpen, t])

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
  useHotkeys('meta+k', () => setOpen(true), { allowInInput: true, allowInTerminal: true })

  // Navigation shortcuts
  useHotkeys('meta+1', () => navigate({ to: '/tasks' }), { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+2', () => navigate({ to: '/terminals' }), { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+3', () => navigate({ to: '/projects' }), { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+u', () => {
    navigate({ to: '/terminals', search: { tab: 'all-tasks' } })
  }, { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+i', () => {
    navigate({ to: '/terminals', search: (prev) => ({ ...prev, tab: 'all-projects' }) })
  }, { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+4', () => navigate({ to: '/review' }), { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+5', () => navigate({ to: '/monitoring' }), { allowInInput: true, allowInTerminal: true })
  useHotkeys('meta+,', () => navigate({ to: '/settings' }), { allowInInput: true, allowInTerminal: true })

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
    { allowInInput: true, allowInTerminal: true, deps: [onShowShortcuts] }
  )

  // Open in editor shortcut (Cmd+E)
  useHotkeys(
    'meta+e',
    () => {
      onOpenInEditor?.()
    },
    { allowInInput: true, allowInTerminal: true, deps: [onOpenInEditor] }
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
        // Number shortcuts (no modifier needed when palette is open)
        case '1':
          e.preventDefault()
          navigate({ to: '/tasks' })
          setOpen(false)
          break
        case '2':
          e.preventDefault()
          navigate({ to: '/terminals' })
          setOpen(false)
          break
        case '3':
          e.preventDefault()
          navigate({ to: '/projects' })
          setOpen(false)
          break
        case '4':
          e.preventDefault()
          navigate({ to: '/review' })
          setOpen(false)
          break
        case '5':
          e.preventDefault()
          navigate({ to: '/monitoring' })
          setOpen(false)
          break
      }
    },
    [flattenedCommands, selectedIndex, setOpen, navigate]
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

  // Listen for desktop app messages (for Cmd+K, Cmd+J, Cmd+/ from native menu)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'vibora:action') {
        switch (event.data.action) {
          case 'openCommandPalette':
            setOpen(true)
            break
          case 'openNewTask':
            onNewTask?.()
            break
          case 'showShortcuts':
            onShowShortcuts?.()
            break
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [setOpen, onNewTask, onShowShortcuts])

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
            placeholder={t('commandPalette.placeholder')}
            className="border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-12"
          />
          <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('commandPalette.noResults')}
            </div>
          ) : (
            <>
              {(['navigation', 'actions'] as const).map((category) => {
                const cmds = groupedCommands.get(category)
                if (!cmds || cmds.length === 0) return null

                return (
                  <div key={category} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {t(`commandPalette.categories.${category}`)}
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
