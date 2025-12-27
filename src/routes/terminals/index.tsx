import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { TerminalGrid } from '@/components/terminal/terminal-grid'
import { TerminalTabBar } from '@/components/terminal/terminal-tab-bar'
import { TabEditDialog } from '@/components/terminal/tab-edit-dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { GridViewIcon, FilterIcon, ComputerTerminal01Icon } from '@hugeicons/core-free-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTerminalStore } from '@/stores'
import type { ITerminal, ITab } from '@/stores'
import { useTasks } from '@/hooks/use-tasks'
import { useRepositories } from '@/hooks/use-repositories'
import { useWorktreeBasePath } from '@/hooks/use-config'
import { cn } from '@/lib/utils'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { TerminalTab, TaskStatus } from '@/types'
import type { TerminalInfo } from '@/hooks/use-terminal-ws'
import { log } from '@/lib/logger'

/**
 * Convert MST terminal to TerminalInfo for backward compatibility with components
 */
function toTerminalInfo(terminal: ITerminal): TerminalInfo {
  return {
    id: terminal.id,
    name: terminal.name,
    cwd: terminal.cwd,
    status: terminal.status,
    exitCode: terminal.exitCode ?? undefined,
    cols: terminal.cols,
    rows: terminal.rows,
    createdAt: terminal.createdAt,
    tabId: terminal.tabId ?? undefined,
    positionInTab: terminal.positionInTab,
  }
}

/**
 * Convert MST tab to TerminalTab for backward compatibility with components
 */
function toTerminalTab(tab: ITab, index: number): TerminalTab {
  return {
    id: tab.id,
    name: tab.name,
    layout: 'single',
    position: index,
    directory: tab.directory ?? undefined,
  }
}

const ALL_TASKS_TAB_ID = 'all-tasks'
const ACTIVE_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'IN_REVIEW']
const LAST_TAB_STORAGE_KEY = 'vibora:lastTerminalTab'

interface TerminalsSearch {
  tab?: string
}

/**
 * Terminals view component wrapped with MobX observer for reactive state updates.
 * Uses MST store for terminal and tab state management.
 */
const TerminalsView = observer(function TerminalsView() {
  const { t } = useTranslation('terminals')
  const navigate = useNavigate()
  const { tab: tabFromUrl } = useSearch({ from: '/terminals/' })
  const {
    terminals,
    tabs,
    connected,
    createTerminal,
    destroyTerminal,
    renameTerminal,
    assignTerminalToTab,
    createTab,
    updateTab,
    deleteTab,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
    sendInputToTerminal,
  } = useTerminalStore()

  // State for tab edit/create dialog
  const [editingTab, setEditingTab] = useState<TerminalTab | null>(null)
  const [isCreatingTab, setIsCreatingTab] = useState(false)

  // URL is the source of truth for active tab
  // Fall back to first tab if URL doesn't specify a valid tab
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])
  const isValidTab = tabFromUrl && (tabIds.includes(tabFromUrl) || tabFromUrl === ALL_TASKS_TAB_ID)
  const activeTabId = isValidTab ? tabFromUrl : (tabs[0]?.id ?? null)

  // Navigate to update URL when changing tabs
  const setActiveTab = useCallback(
    (tabId: string) => {
      navigate({ to: '/terminals', search: { tab: tabId }, replace: true })
    },
    [navigate]
  )

  // Redirect to last tab (from localStorage) or first tab if URL has no/invalid tab
  useEffect(() => {
    if (tabs.length > 0 && !isValidTab) {
      const lastTab = localStorage.getItem(LAST_TAB_STORAGE_KEY)
      const targetTab = lastTab && (tabs.some(t => t.id === lastTab) || lastTab === ALL_TASKS_TAB_ID)
        ? lastTab
        : tabs[0].id
      navigate({ to: '/terminals', search: { tab: targetTab }, replace: true })
    }
  }, [tabs, isValidTab, navigate])

  // Persist active tab to localStorage
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(LAST_TAB_STORAGE_KEY, activeTabId)
    }
  }, [activeTabId])

  const { data: tasks = [], status: tasksStatus } = useTasks()
  const { data: repositories = [] } = useRepositories()
  const { data: worktreeBasePath } = useWorktreeBasePath()
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  // Map repository path to repository id for linking
  const repoIdByPath = useMemo(() => {
    const map = new Map<string, string>()
    for (const repo of repositories) {
      map.set(repo.path, repo.id)
    }
    return map
  }, [repositories])

  // Get worktree paths for active tasks (IN_PROGRESS, IN_REVIEW) - shown in All Tasks tab
  const activeTaskWorktrees = useMemo(() => {
    return new Set(
      tasks
        .filter((t) => ACTIVE_STATUSES.includes(t.status) && t.worktreePath)
        .map((t) => t.worktreePath!)
    )
  }, [tasks])

  // Count only visible terminals for limit check:
  // - Terminals in regular tabs (have a tabId)
  // - Terminals from active tasks (visible in Task Terminals view)
  // This excludes terminals from done/cancelled tasks which are hidden from the user
  const visibleTerminalCount = useMemo(() => {
    return terminals.filter(
      (t) => t.tabId != null || (t.cwd && activeTaskWorktrees.has(t.cwd))
    ).length
  }, [terminals, activeTaskWorktrees])

  // Get ALL task worktree paths - these terminals should never be in regular tabs
  const allTaskWorktrees = useMemo(() => {
    return new Set(
      tasks
        .filter((t) => t.worktreePath)
        .map((t) => t.worktreePath!)
    )
  }, [tasks])

  // Map worktree path to task info for navigation and display
  const taskInfoByCwd = useMemo(() => {
    const map = new Map<string, {
      taskId: string
      repoId: string | undefined
      repoName: string
      title: string
      repoPath: string
      worktreePath: string
      baseBranch: string
      branch: string | null
      prUrl: string | null
    }>()
    for (const task of tasks) {
      if (task.worktreePath) {
        map.set(task.worktreePath, {
          taskId: task.id,
          repoId: repoIdByPath.get(task.repoPath),
          repoName: task.repoName,
          title: task.title,
          repoPath: task.repoPath,
          worktreePath: task.worktreePath,
          baseBranch: task.baseBranch,
          branch: task.branch,
          prUrl: task.prUrl,
        })
      }
    }
    return map
  }, [tasks, repoIdByPath])

  // Unique repo names from active tasks for filtering
  const repoNames = useMemo(() => {
    const names = new Set(
      tasks
        .filter((t) => ACTIVE_STATUSES.includes(t.status))
        .map((t) => t.repoName)
    )
    return Array.from(names).sort()
  }, [tasks])

  const cleanupFnsRef = useRef<Map<string, () => void>>(new Map())
  const terminalCountRef = useRef(0)
  // Guard against duplicate creations from React Strict Mode or double-click
  const pendingTerminalCreateRef = useRef(false)
  const pendingTabCreateRef = useRef(false)
  // Track the number of tabs when we initiated a tab creation to detect new tabs
  const tabCountBeforeCreateRef = useRef<number | null>(null)

  // Destroy orphaned worktree terminals (terminals in worktrees dir but no matching task)
  // This cleanup is intentionally conservative to avoid accidental destruction:
  // 1. Only runs when tasks are loaded AND we have at least one task (empty tasks = likely error)
  // 2. Only affects terminals without a tabId (task terminals, not regular tab terminals)
  // 3. Only affects terminals in the worktrees directory
  useEffect(() => {
    log.terminalsView.debug('Orphan cleanup effect running', {
      worktreeBasePath,
      tasksStatus,
      taskCount: tasks.length,
      terminalCount: terminals.length,
      allTaskWorktreesSize: allTaskWorktrees.size,
    })

    // Guard 1: Need worktreeBasePath to know which terminals are in worktrees dir
    if (!worktreeBasePath) {
      log.terminalsView.debug('Orphan cleanup skipped: no worktreeBasePath')
      return
    }

    // Guard 2: Tasks must be successfully loaded
    if (tasksStatus !== 'success') {
      log.terminalsView.debug('Orphan cleanup skipped', { reason: `tasksStatus=${tasksStatus}` })
      return
    }

    // Guard 3: If tasks array is empty, this likely indicates an error or the user has no tasks
    // In either case, we should NOT destroy terminals - better to be safe
    if (tasks.length === 0) {
      log.terminalsView.debug('Orphan cleanup skipped: no tasks loaded (likely error or empty state)')
      return
    }

    for (const terminal of terminals) {
      // Skip terminals that belong to regular tabs - they're not orphans
      if (terminal.tabId) {
        continue
      }

      const isInWorktreesDir = terminal.cwd?.startsWith(worktreeBasePath)
      const isKnownTask = terminal.cwd && allTaskWorktrees.has(terminal.cwd)

      if (isInWorktreesDir && !isKnownTask) {
        log.terminalsView.warn('DESTROYING ORPHAN TERMINAL', {
          terminalId: terminal.id,
          name: terminal.name,
          cwd: terminal.cwd,
        })
        destroyTerminal(terminal.id)
      }
    }
  }, [terminals, allTaskWorktrees, worktreeBasePath, destroyTerminal, tasksStatus, tasks.length])

  // Filter terminals for the active tab and convert to TerminalInfo for component compatibility
  const visibleTerminals = useMemo(() => {
    if (activeTabId === ALL_TASKS_TAB_ID) {
      // Show terminals for active tasks, sorted by newest task first, with optional repo filter
      return terminals
        .filter((t) => t.cwd && activeTaskWorktrees.has(t.cwd))
        .filter((t) => {
          if (!repoFilter) return true
          const task = tasks.find((task) => task.worktreePath === t.cwd)
          return task?.repoName === repoFilter
        })
        .sort((a, b) => {
          const taskA = tasks.find((t) => t.worktreePath === a.cwd)
          const taskB = tasks.find((t) => t.worktreePath === b.cwd)
          if (!taskA || !taskB) return 0
          return new Date(taskB.createdAt).getTime() - new Date(taskA.createdAt).getTime()
        })
        .map(toTerminalInfo)
    }
    // Filter terminals by tabId, sorted by positionInTab
    return terminals
      .filter((t) => t.tabId === activeTabId)
      .sort((a, b) => a.positionInTab - b.positionInTab)
      .map(toTerminalInfo)
  }, [activeTabId, terminals, activeTaskWorktrees, repoFilter, tasks])

  const handleTerminalAdd = useCallback(() => {
    log.terminal.info('handleTerminalAdd called', {
      activeTabId,
      connected,
      pendingTerminalCreate: pendingTerminalCreateRef.current,
      terminalCount: terminals.length,
    })

    // Prevent duplicate creations from double-clicks or React Strict Mode
    if (pendingTerminalCreateRef.current) {
      log.terminal.debug('Skipping terminal creation, already pending')
      return
    }
    pendingTerminalCreateRef.current = true

    terminalCountRef.current++
    const terminalName = `Terminal ${terminalCountRef.current}`

    // Calculate position for new terminal (append to end)
    const terminalsInTab = terminals.filter((t) => t.tabId === activeTabId)
    const positionInTab = terminalsInTab.length

    log.terminal.info('Creating terminal', {
      name: terminalName,
      tabId: activeTabId,
      positionInTab,
      terminalsInTabCount: terminalsInTab.length,
    })

    createTerminal({
      name: terminalName,
      cols: 80,
      rows: 24,
      tabId: activeTabId ?? undefined,
      positionInTab,
    })

    // Reset pending flag after a short delay to allow the creation to complete
    setTimeout(() => {
      pendingTerminalCreateRef.current = false
    }, 500)
  }, [createTerminal, activeTabId, terminals, connected])

  // Task-related terminals should not be in regular tabs - remove them if they are
  useEffect(() => {
    // Wait for tasks to load before determining which terminals are task-related
    if (tasksStatus !== 'success') {
      log.terminalsView.debug('Tab assignment effect skipped', { tasksStatus })
      return
    }

    for (const terminal of terminals) {
      const isTaskTerminal = terminal.cwd && allTaskWorktrees.has(terminal.cwd)
      if (isTaskTerminal && terminal.tabId) {
        log.terminalsView.debug('Removing task terminal from regular tab', {
          terminalId: terminal.id,
          name: terminal.name,
          cwd: terminal.cwd,
          tabId: terminal.tabId,
        })
        // Remove task terminals from regular tabs - they should only appear in All Tasks
        assignTerminalToTab(terminal.id, null)
      }
    }
  }, [terminals, allTaskWorktrees, assignTerminalToTab, tasksStatus])

  // Auto-open newly created tabs and create a terminal inside
  useEffect(() => {
    // Only run if we're expecting a new tab (tabCountBeforeCreateRef is set)
    if (tabCountBeforeCreateRef.current === null) return

    // Check if a new tab was added
    if (tabs.length > tabCountBeforeCreateRef.current) {
      // Find the newest tab (highest position)
      const newestTab = tabs.reduce((prev, curr) =>
        curr.position > prev.position ? curr : prev
      )

      log.terminal.debug('New tab detected, auto-opening', { tabId: newestTab.id, name: newestTab.name })

      // Clear the ref to prevent re-triggering
      tabCountBeforeCreateRef.current = null

      // Switch to the new tab
      setActiveTab(newestTab.id)

      // Create a terminal inside the new tab after a short delay
      // to ensure the tab switch is processed first
      setTimeout(() => {
        terminalCountRef.current++
        const terminalName = `Terminal ${terminalCountRef.current}`
        log.terminal.debug('Creating terminal in new tab', { tabId: newestTab.id, name: terminalName })
        createTerminal({
          name: terminalName,
          cols: 80,
          rows: 24,
          tabId: newestTab.id,
          positionInTab: 0,
        })
      }, 100)
    }
  }, [tabs, setActiveTab, createTerminal])

  const handleTerminalClose = useCallback(
    (terminalId: string) => {
      // Clean up xterm attachment
      const cleanup = cleanupFnsRef.current.get(terminalId)
      if (cleanup) {
        cleanup()
        cleanupFnsRef.current.delete(terminalId)
      }
      // User-initiated close - pass force flag to allow destroying tab terminals
      destroyTerminal(terminalId, { force: true, reason: 'user_closed' })
    },
    [destroyTerminal]
  )

  const handleTerminalReady = useCallback(
    (terminalId: string, xterm: XTerm) => {
      // Attach xterm to terminal via WebSocket
      const cleanup = attachXterm(terminalId, xterm)
      cleanupFnsRef.current.set(terminalId, cleanup)
    },
    [attachXterm]
  )

  const handleTerminalResize = useCallback(
    (terminalId: string, cols: number, rows: number) => {
      resizeTerminal(terminalId, cols, rows)
    },
    [resizeTerminal]
  )

  const handleTerminalRename = useCallback(
    (terminalId: string, name: string) => {
      renameTerminal(terminalId, name)
    },
    [renameTerminal]
  )

  const handleTabCreate = useCallback(() => {
    // Open dialog to create a new tab
    setIsCreatingTab(true)
  }, [])

  const handleTabCreateConfirm = useCallback(
    (name: string, directory?: string) => {
      // Prevent duplicate creations from double-clicks or React Strict Mode
      if (pendingTabCreateRef.current) {
        log.terminal.debug('Skipping tab creation, already pending')
        return
      }
      pendingTabCreateRef.current = true

      // Record current tab count to detect when new tab arrives
      tabCountBeforeCreateRef.current = tabs.length

      log.terminal.debug('Creating tab', { name, directory })
      createTab(name, undefined, directory)

      // Reset pending flag after a short delay to allow the creation to complete
      setTimeout(() => {
        pendingTabCreateRef.current = false
      }, 500)
    },
    [createTab, tabs.length]
  )

  const handleTabDelete = useCallback(
    (tabId: string) => {
      // Clean up xterm attachments for terminals in this tab
      // (server will cascade-delete the terminals when the tab is deleted)
      const terminalsInTab = terminals.filter((t) => t.tabId === tabId)
      for (const terminal of terminalsInTab) {
        const cleanup = cleanupFnsRef.current.get(terminal.id)
        if (cleanup) {
          cleanup()
          cleanupFnsRef.current.delete(terminal.id)
        }
      }
      // Server handles cascade deletion of terminals
      deleteTab(tabId)
    },
    [terminals, deleteTab]
  )

  // Convert our tabs to the format TerminalTabBar expects
  const tabBarTabs: TerminalTab[] = tabs.map(toTerminalTab)

  const handleTabEdit = useCallback((tab: TerminalTab) => {
    setEditingTab(tab)
  }, [])

  const handleTabUpdate = useCallback(
    (tabId: string, updates: { name?: string; directory?: string | null }) => {
      updateTab(tabId, updates)
    },
    [updateTab]
  )

  return (
    <div className="flex h-full max-w-full flex-col overflow-hidden">
      {/* Tab Bar + Actions */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background px-2 py-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center">
            {/* Task Terminals system tab - always first */}
            <button
              onClick={() => setActiveTab(ALL_TASKS_TAB_ID)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors max-sm:px-2',
                activeTabId === ALL_TASKS_TAB_ID
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-opacity',
                activeTabId === ALL_TASKS_TAB_ID ? 'after:opacity-100' : 'after:opacity-0'
              )}
            >
              <HugeiconsIcon icon={GridViewIcon} size={12} strokeWidth={2} />
              <span className="max-sm:hidden">{t('taskTerminals')}</span>
            </button>
            <TerminalTabBar
              tabs={tabBarTabs}
              activeTabId={activeTabId ?? ''}
              onTabSelect={setActiveTab}
              onTabClose={handleTabDelete}
              onTabCreate={handleTabCreate}
              onTabEdit={handleTabEdit}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 max-sm:gap-1">
          {/* Repo filter (only when Task Terminals is active and multiple repos exist) */}
          {activeTabId === ALL_TASKS_TAB_ID && repoNames.length > 1 && (
            <Select
              value={repoFilter ?? ''}
              onValueChange={(v) => setRepoFilter(v || null)}
            >
              <SelectTrigger size="sm" className="max-sm:w-auto">
                <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                <SelectValue>
                  {repoFilter || t('allRepos')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('allRepos')}</SelectItem>
                {repoNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTerminalAdd}
            disabled={!connected || visibleTerminalCount >= 24 || activeTabId === ALL_TASKS_TAB_ID}
            className="max-sm:px-2 border-transparent text-primary"
          >
            <HugeiconsIcon
              icon={ComputerTerminal01Icon}
              size={14}
              strokeWidth={2}
              data-slot="icon"
            />
            <span className="max-sm:hidden">{t('newTerminal')}</span>
          </Button>
        </div>
      </div>

      {/* Terminal Grid */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <TerminalGrid
          terminals={visibleTerminals}
          onTerminalClose={activeTabId === ALL_TASKS_TAB_ID ? undefined : handleTerminalClose}
          onTerminalAdd={connected && activeTabId !== ALL_TASKS_TAB_ID ? handleTerminalAdd : undefined}
          onTerminalReady={handleTerminalReady}
          onTerminalResize={handleTerminalResize}
          onTerminalRename={activeTabId === ALL_TASKS_TAB_ID ? undefined : handleTerminalRename}
          setupImagePaste={setupImagePaste}
          writeToTerminal={writeToTerminal}
          sendInputToTerminal={sendInputToTerminal}
          taskInfoByCwd={activeTabId === ALL_TASKS_TAB_ID ? taskInfoByCwd : undefined}
        />
      </div>

      {/* Tab Edit/Create Dialog */}
      <TabEditDialog
        tab={editingTab}
        open={editingTab !== null || isCreatingTab}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTab(null)
            setIsCreatingTab(false)
          }
        }}
        onSave={handleTabUpdate}
        onCreate={handleTabCreateConfirm}
        defaultName={`Tab ${tabs.length + 1}`}
      />
    </div>
  )
})

export const Route = createFileRoute('/terminals/')({
  component: TerminalsView,
  validateSearch: (search: Record<string, unknown>): TerminalsSearch => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
})
