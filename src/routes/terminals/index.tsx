import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { TerminalGrid } from '@/components/terminal/terminal-grid'
import { TerminalTabBar } from '@/components/terminal/terminal-tab-bar'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, GridViewIcon, FilterIcon } from '@hugeicons/core-free-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { useTerminalViewState } from '@/hooks/use-terminal-view-state'
import { useTasks } from '@/hooks/use-tasks'
import { useWorktreeBasePath } from '@/hooks/use-config'
import { cn } from '@/lib/utils'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { TerminalTab, TaskStatus } from '@/types'

const ALL_TASKS_TAB_ID = 'all-tasks'
const ACTIVE_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'IN_REVIEW']

export const Route = createFileRoute('/terminals/')({
  component: TerminalsView,
})

function TerminalsView() {
  const {
    terminals,
    tabs,
    connected,
    createTerminal,
    destroyTerminal,
    renameTerminal,
    assignTerminalToTab,
    createTab,
    renameTab,
    deleteTab,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
  } = useTerminalWS()

  // Track active tab via server-persisted state
  const { activeTabId, setActiveTab, isLoading: isViewStateLoading } = useTerminalViewState()

  // Ensure activeTabId is valid - set to first tab if invalid
  useEffect(() => {
    if (tabs.length > 0 && !isViewStateLoading) {
      const tabIds = tabs.map((t) => t.id)
      if (!activeTabId || (!tabIds.includes(activeTabId) && activeTabId !== ALL_TASKS_TAB_ID)) {
        setActiveTab(tabs[0].id)
      }
    }
  }, [tabs, activeTabId, isViewStateLoading, setActiveTab])

  const { data: tasks = [] } = useTasks()
  const { data: worktreeBasePath } = useWorktreeBasePath()
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  // Get worktree paths for active tasks (IN_PROGRESS, IN_REVIEW) - shown in All Tasks tab
  const activeTaskWorktrees = useMemo(() => {
    return new Set(
      tasks
        .filter((t) => ACTIVE_STATUSES.includes(t.status) && t.worktreePath)
        .map((t) => t.worktreePath!)
    )
  }, [tasks])

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
      repoName: string
      title: string
      repoPath: string
      worktreePath: string
      baseBranch: string
      branch: string | null
    }>()
    for (const task of tasks) {
      if (task.worktreePath) {
        map.set(task.worktreePath, {
          taskId: task.id,
          repoName: task.repoName,
          title: task.title,
          repoPath: task.repoPath,
          worktreePath: task.worktreePath,
          baseBranch: task.baseBranch,
          branch: task.branch,
        })
      }
    }
    return map
  }, [tasks])

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
  const pasteCleanupFnsRef = useRef<Map<string, () => void>>(new Map())
  const containerRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalCountRef = useRef(0)

  // Destroy orphaned worktree terminals (terminals in worktrees dir but no matching task)
  useEffect(() => {
    if (!worktreeBasePath) return

    for (const terminal of terminals) {
      const isInWorktreesDir = terminal.cwd?.startsWith(worktreeBasePath)
      const isKnownTask = terminal.cwd && allTaskWorktrees.has(terminal.cwd)

      if (isInWorktreesDir && !isKnownTask) {
        destroyTerminal(terminal.id)
      }
    }
  }, [terminals, allTaskWorktrees, worktreeBasePath, destroyTerminal])

  // Filter terminals for the active tab
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
    }
    // Filter terminals by tabId, sorted by positionInTab
    return terminals
      .filter((t) => t.tabId === activeTabId)
      .sort((a, b) => (a.positionInTab ?? 0) - (b.positionInTab ?? 0))
  }, [activeTabId, terminals, activeTaskWorktrees, repoFilter, tasks])

  const handleTerminalAdd = useCallback(() => {
    terminalCountRef.current++
    // Calculate position for new terminal (append to end)
    const terminalsInTab = terminals.filter((t) => t.tabId === activeTabId)
    const positionInTab = terminalsInTab.length
    createTerminal({
      name: `Terminal ${terminalCountRef.current}`,
      cols: 80,
      rows: 24,
      tabId: activeTabId ?? undefined,
      positionInTab,
    })
  }, [createTerminal, activeTabId, terminals])

  // Task-related terminals should not be in regular tabs - remove them if they are
  useEffect(() => {
    for (const terminal of terminals) {
      const isTaskTerminal = terminal.cwd && allTaskWorktrees.has(terminal.cwd)
      if (isTaskTerminal && terminal.tabId) {
        // Remove task terminals from regular tabs - they should only appear in All Tasks
        assignTerminalToTab(terminal.id, null)
      }
    }
  }, [terminals, allTaskWorktrees, assignTerminalToTab])

  // Set up image paste when container is available
  const trySetupImagePaste = useCallback(
    (terminalId: string) => {
      const container = containerRefsMap.current.get(terminalId)
      if (!container) return

      // Already set up
      if (pasteCleanupFnsRef.current.has(terminalId)) return

      const cleanup = setupImagePaste(container, terminalId)
      pasteCleanupFnsRef.current.set(terminalId, cleanup)
    },
    [setupImagePaste]
  )

  const handleTerminalClose = useCallback(
    (terminalId: string) => {
      // Clean up xterm attachment
      const cleanup = cleanupFnsRef.current.get(terminalId)
      if (cleanup) {
        cleanup()
        cleanupFnsRef.current.delete(terminalId)
      }
      // Clean up image paste handler
      const pasteCleanup = pasteCleanupFnsRef.current.get(terminalId)
      if (pasteCleanup) {
        pasteCleanup()
        pasteCleanupFnsRef.current.delete(terminalId)
      }
      containerRefsMap.current.delete(terminalId)
      destroyTerminal(terminalId)
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

  const handleTerminalContainerReady = useCallback(
    (terminalId: string, container: HTMLDivElement) => {
      containerRefsMap.current.set(terminalId, container)
      trySetupImagePaste(terminalId)
    },
    [trySetupImagePaste]
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
    const tabCount = tabs.length
    createTab(`Tab ${tabCount + 1}`)
  }, [createTab, tabs.length])

  const handleTabDelete = useCallback(
    (tabId: string) => {
      // Destroy all terminals in this tab
      const terminalsInTab = terminals.filter((t) => t.tabId === tabId)
      for (const terminal of terminalsInTab) {
        handleTerminalClose(terminal.id)
      }
      deleteTab(tabId)
    },
    [terminals, deleteTab, handleTerminalClose]
  )

  // Convert our tabs to the format TerminalTabBar expects
  const tabBarTabs: TerminalTab[] = tabs.map((t, index) => ({
    id: t.id,
    name: t.name,
    layout: 'single',
    position: index,
  }))

  return (
    <div className="flex h-full flex-col">
      {/* Tab Bar + Actions */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-2 py-1">
        <TerminalTabBar
          tabs={tabBarTabs}
          activeTabId={activeTabId ?? ''}
          onTabSelect={setActiveTab}
          onTabClose={handleTabDelete}
          onTabCreate={handleTabCreate}
          onTabRename={renameTab}
        />
        <div className="flex items-center gap-3">
          {/* Repo filter (only when Task Terminals is active and multiple repos exist) */}
          {activeTabId === ALL_TASKS_TAB_ID && repoNames.length > 1 && (
            <Select
              value={repoFilter ?? ''}
              onValueChange={(v) => setRepoFilter(v || null)}
            >
              <SelectTrigger size="sm" className="min-w-[120px]">
                <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                <SelectValue>
                  {repoFilter || 'All Repos'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-[200px]">
                <SelectItem value="">All Repos</SelectItem>
                {repoNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Task Terminals system tab */}
          <button
            onClick={() => setActiveTab(ALL_TASKS_TAB_ID)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
              activeTabId === ALL_TASKS_TAB_ID
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <HugeiconsIcon icon={GridViewIcon} size={12} strokeWidth={2} />
            Task Terminals
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTerminalAdd}
            disabled={!connected || terminals.length >= 12 || activeTabId === ALL_TASKS_TAB_ID}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={14}
              strokeWidth={2}
              data-slot="icon"
            />
            New Terminal
          </Button>
        </div>
      </div>

      {/* Terminal Grid */}
      <div className="pixel-grid flex-1 overflow-hidden">
        <TerminalGrid
          terminals={visibleTerminals}
          onTerminalClose={activeTabId === ALL_TASKS_TAB_ID ? undefined : handleTerminalClose}
          onTerminalAdd={connected && activeTabId !== ALL_TASKS_TAB_ID ? handleTerminalAdd : undefined}
          onTerminalReady={handleTerminalReady}
          onTerminalResize={handleTerminalResize}
          onTerminalRename={activeTabId === ALL_TASKS_TAB_ID ? undefined : handleTerminalRename}
          onTerminalContainerReady={handleTerminalContainerReady}
          taskInfoByCwd={activeTabId === ALL_TASKS_TAB_ID ? taskInfoByCwd : undefined}
        />
      </div>
    </div>
  )
}
