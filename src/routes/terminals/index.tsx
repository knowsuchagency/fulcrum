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
import { useTerminalTabs } from '@/hooks/use-terminal-tabs'
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
    connected,
    createTerminal,
    destroyTerminal,
    renameTerminal,
    attachXterm,
    resizeTerminal,
  } = useTerminalWS()

  const {
    tabs,
    activeTabId,
    activeTab,
    createTab,
    renameTab,
    deleteTab,
    setActiveTab,
    addTerminalToTab,
    removeTerminalFromTab,
    reconcileTerminals,
  } = useTerminalTabs()

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
    const map = new Map<string, { taskId: string; repoName: string; title: string }>()
    for (const task of tasks) {
      if (task.worktreePath) {
        map.set(task.worktreePath, {
          taskId: task.id,
          repoName: task.repoName,
          title: task.title,
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
  const terminalCountRef = useRef(0)
  const prevTerminalIdsRef = useRef<string[]>([])

  // Reconcile tabs with actual terminals when terminal list changes
  useEffect(() => {
    const currentIds = terminals.map((t) => t.id)
    const prevIds = prevTerminalIdsRef.current

    // Only reconcile if the terminal IDs actually changed
    if (
      currentIds.length !== prevIds.length ||
      !currentIds.every((id) => prevIds.includes(id))
    ) {
      reconcileTerminals(currentIds)
      prevTerminalIdsRef.current = currentIds
    }
  }, [terminals, reconcileTerminals])

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
    return activeTab
      ? terminals.filter((t) => activeTab.terminalIds.includes(t.id))
      : []
  }, [activeTabId, activeTab, terminals, activeTaskWorktrees, repoFilter, tasks])

  const handleTerminalAdd = useCallback(() => {
    terminalCountRef.current++
    createTerminal({
      name: `Terminal ${terminalCountRef.current}`,
      cols: 80,
      rows: 24,
    })
  }, [createTerminal])

  // When a standalone terminal is created, add it to the active tab
  // Task-related terminals (those with cwd matching a task worktree) should NOT be added to regular tabs
  useEffect(() => {
    const tabTerminalIds = tabs.flatMap((t) => t.terminalIds)

    for (const terminal of terminals) {
      const isTaskTerminal = terminal.cwd && allTaskWorktrees.has(terminal.cwd)
      const isInTab = tabTerminalIds.includes(terminal.id)

      if (isTaskTerminal && isInTab) {
        // Remove task terminals from regular tabs - they should only appear in All Tasks
        removeTerminalFromTab(terminal.id)
      } else if (!isTaskTerminal && !isInTab) {
        // Add standalone terminals to the active tab
        addTerminalToTab(terminal.id)
      }
    }
  }, [terminals, tabs, addTerminalToTab, removeTerminalFromTab, allTaskWorktrees])

  const handleTerminalClose = useCallback(
    (terminalId: string) => {
      // Clean up xterm attachment
      const cleanup = cleanupFnsRef.current.get(terminalId)
      if (cleanup) {
        cleanup()
        cleanupFnsRef.current.delete(terminalId)
      }
      removeTerminalFromTab(terminalId)
      destroyTerminal(terminalId)
    },
    [destroyTerminal, removeTerminalFromTab]
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
    createTab()
  }, [createTab])

  const handleTabDelete = useCallback(
    (tabId: string) => {
      // Destroy all terminals in this tab
      const tab = tabs.find((t) => t.id === tabId)
      if (tab) {
        for (const terminalId of tab.terminalIds) {
          handleTerminalClose(terminalId)
        }
      }
      deleteTab(tabId)
    },
    [tabs, deleteTab, handleTerminalClose]
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
          activeTabId={activeTabId}
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
          taskInfoByCwd={activeTabId === ALL_TASKS_TAB_ID ? taskInfoByCwd : undefined}
        />
      </div>
    </div>
  )
}
