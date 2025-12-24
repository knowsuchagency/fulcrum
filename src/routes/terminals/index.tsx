import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useRepositories } from '@/hooks/use-repositories'
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
  const { t } = useTranslation('terminals')
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
    writeToTerminal,
    sendInputToTerminal,
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

  const { data: tasks = [], isLoading: isTasksLoading } = useTasks()
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

  // Destroy orphaned worktree terminals (terminals in worktrees dir but no matching task)
  useEffect(() => {
    // Don't run cleanup until tasks are loaded - otherwise we'd destroy valid terminals
    // because allTaskWorktrees would be empty while tasks are still loading
    if (!worktreeBasePath || isTasksLoading) return

    for (const terminal of terminals) {
      const isInWorktreesDir = terminal.cwd?.startsWith(worktreeBasePath)
      const isKnownTask = terminal.cwd && allTaskWorktrees.has(terminal.cwd)

      if (isInWorktreesDir && !isKnownTask) {
        destroyTerminal(terminal.id)
      }
    }
  }, [terminals, allTaskWorktrees, worktreeBasePath, destroyTerminal, isTasksLoading])

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

  const handleTerminalClose = useCallback(
    (terminalId: string) => {
      // Clean up xterm attachment
      const cleanup = cleanupFnsRef.current.get(terminalId)
      if (cleanup) {
        cleanup()
        cleanupFnsRef.current.delete(terminalId)
      }
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
    <div className="flex h-full max-w-full flex-col overflow-hidden">
      {/* Tab Bar + Actions */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-2 py-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <TerminalTabBar
            tabs={tabBarTabs}
            activeTabId={activeTabId ?? ''}
            onTabSelect={setActiveTab}
            onTabClose={handleTabDelete}
            onTabCreate={handleTabCreate}
            onTabRename={renameTab}
          />
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
          {/* Task Terminals system tab */}
          <button
            onClick={() => setActiveTab(ALL_TASKS_TAB_ID)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors max-sm:px-2',
              activeTabId === ALL_TASKS_TAB_ID
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <HugeiconsIcon icon={GridViewIcon} size={12} strokeWidth={2} />
            <span className="max-sm:hidden">{t('taskTerminals')}</span>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTerminalAdd}
            disabled={!connected || visibleTerminalCount >= 24 || activeTabId === ALL_TASKS_TAB_ID}
            className="max-sm:px-2"
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={14}
              strokeWidth={2}
              data-slot="icon"
            />
            <span className="max-sm:hidden">{t('newTerminal')}</span>
          </Button>
        </div>
      </div>

      {/* Terminal Grid */}
      <div className="pixel-grid min-w-0 flex-1 overflow-hidden">
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
    </div>
  )
}
