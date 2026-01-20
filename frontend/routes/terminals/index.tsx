import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { reaction } from 'mobx'
import { TerminalGrid } from '@/components/terminal/terminal-grid'
import { TerminalTabBar } from '@/components/terminal/terminal-tab-bar'
import { TabEditDialog } from '@/components/terminal/tab-edit-dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { TaskDaily01Icon, FilterIcon, ComputerTerminal01Icon, FolderLibraryIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTerminalStore, useStore } from '@/stores'
import type { ITerminal, ITab } from '@/stores'
import { useTasks } from '@/hooks/use-tasks'
import { useRepositories } from '@/hooks/use-repositories'
import { useTerminalViewState } from '@/hooks/use-terminal-view-state'
import { useHotkeys } from '@/hooks/use-hotkeys'
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
const ALL_REPOS_TAB_ID = 'all-repos'
const ACTIVE_STATUSES: TaskStatus[] = ['IN_PROGRESS', 'IN_REVIEW']
const LAST_TAB_STORAGE_KEY = 'fulcrum:lastTerminalTab'

interface TerminalsSearch {
  tab?: string
  repos?: string // comma-separated repo names for multi-select filter (for Tasks tab)
  repoIds?: string // comma-separated repository IDs for multi-select filter (for Repos tab)
}

/**
 * Terminals view component wrapped with MobX observer for reactive state updates.
 * Uses MST store for terminal and tab state management.
 */
const TerminalsView = observer(function TerminalsView() {
  const { t } = useTranslation('terminals')
  const navigate = useNavigate()
  const { tab: tabFromUrl, repos: reposFilter, repoIds: repoIdsFilter } = useSearch({ from: '/terminals/' })
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
    reorderTab,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
    sendInputToTerminal,
    newTerminalIds,
    pendingTabCreation,
    lastCreatedTabId,
  } = useTerminalStore()

  // State for tab edit dialog
  const [editingTab, setEditingTab] = useState<TerminalTab | null>(null)

  // View state for tracking focused terminals and selected repositories
  const { getFocusedTerminal, selectedRepositoryIds: persistedRepoIds, setSelectedRepositories, isLoading: isViewStateLoading } = useTerminalViewState()

  // URL is the source of truth for active tab
  // Fall back to first tab if URL doesn't specify a valid tab
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])
  const isValidTab = tabFromUrl && (tabIds.includes(tabFromUrl) || tabFromUrl === ALL_TASKS_TAB_ID || tabFromUrl === ALL_REPOS_TAB_ID)
  const activeTabId = isValidTab ? tabFromUrl : (tabs[0]?.id ?? null)

  // Navigate to update URL when changing tabs
  const setActiveTab = useCallback(
    (tabId: string) => {
      // Preserve filters only for the relevant tab type
      const repos = tabId === ALL_TASKS_TAB_ID ? reposFilter : undefined
      const repoIds = tabId === ALL_REPOS_TAB_ID ? repoIdsFilter : undefined
      navigate({ to: '/terminals', search: { tab: tabId, repos, repoIds }, replace: true })
    },
    [navigate, reposFilter, repoIdsFilter]
  )

  // Toggle a project in the task filter multi-select
  const toggleTaskProjectFilter = useCallback(
    (projectId: string, checked: boolean) => {
      const currentIds = reposFilter?.split(',').filter(Boolean) ?? []
      const newIds = checked
        ? [...currentIds, projectId]
        : currentIds.filter((id) => id !== projectId)
      navigate({
        to: '/terminals',
        search: (prev) => ({ ...prev, repos: newIds.length > 0 ? newIds.join(',') : undefined }),
        replace: true,
      })
    },
    [navigate, reposFilter]
  )

  // Get raw store for MobX reaction (observer() doesn't help with useEffect dependencies)
  const store = useStore()

  // MobX reaction to handle newly created tabs
  // This is needed because React's useEffect doesn't re-run when MobX observables change
  // unless the component re-renders first. The reaction explicitly subscribes to store changes.
  useEffect(() => {
    const dispose = reaction(
      // Track these observables
      () => ({
        lastCreatedTabId: store.lastCreatedTabId,
        pendingTabCreation: store.pendingTabCreation,
      }),
      // React to changes
      ({ lastCreatedTabId: tabId }) => {
        if (tabId) {
          log.terminal.info('MobX reaction: lastCreatedTabId changed', { tabId })
          setActiveTab(tabId)

          // Clear lastCreatedTabId and create terminal AFTER navigation settles
          // This delay prevents the redirect effect from racing and overriding our navigation
          setTimeout(() => {
            store.clearLastCreatedTabId()
            terminalCountRef.current++
            const terminalName = `Terminal ${terminalCountRef.current}`
            log.terminal.debug('Creating terminal in new tab', { tabId, name: terminalName })
            createTerminal({
              name: terminalName,
              cols: 80,
              rows: 24,
              tabId,
              positionInTab: 0,
            })
          }, 150)
        }
      },
      { fireImmediately: true } // Check current value on mount
    )
    return dispose
  }, [store, setActiveTab, createTerminal])

  // Redirect effect - handles invalid URL when not waiting for tab creation
  useEffect(() => {
    log.terminal.debug('Redirect effect running', {
      tabsLength: tabs.length,
      isValidTab,
      pendingTabCreation,
      lastCreatedTabId,
    })

    if (tabs.length === 0) return

    // Don't redirect while waiting for tab creation
    if (pendingTabCreation || lastCreatedTabId) {
      return
    }

    // Redirect to valid tab if URL is invalid
    if (!isValidTab) {
      const lastTab = localStorage.getItem(LAST_TAB_STORAGE_KEY)
      const targetTab = lastTab && (tabs.some(t => t.id === lastTab) || lastTab === ALL_TASKS_TAB_ID || lastTab === ALL_REPOS_TAB_ID)
        ? lastTab
        : tabs[0].id
      log.terminal.debug('Redirecting to tab', { targetTab })
      navigate({ to: '/terminals', search: { tab: targetTab }, replace: true })
    }
  }, [tabs, isValidTab, lastCreatedTabId, pendingTabCreation, navigate])

  // Persist active tab to localStorage
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(LAST_TAB_STORAGE_KEY, activeTabId)
    }
  }, [activeTabId])

  const { data: tasks = [], status: tasksStatus } = useTasks()
  const { data: repositories = [] } = useRepositories()

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
      pinned: boolean
    }>()
    for (const task of tasks) {
      // Only include tasks with worktree that have required repo info
      if (task.worktreePath && task.repoPath && task.repoName && task.baseBranch) {
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
          pinned: task.pinned,
        })
      }
    }
    return map
  }, [tasks, repoIdByPath])

  // Unique project IDs from active tasks for filtering (including 'inbox' for tasks without project)
  const taskProjectOptions = useMemo(() => {
    const projectIds = new Set<string>()
    let hasInboxTasks = false
    for (const task of tasks) {
      if (ACTIVE_STATUSES.includes(task.status)) {
        if (task.projectId) {
          projectIds.add(task.projectId)
        } else {
          hasInboxTasks = true
        }
      }
    }
    // Map project IDs to names for display (lookup from tasks)
    const options: { id: string; name: string }[] = []
    const seenIds = new Set<string>()
    for (const task of tasks) {
      if (task.projectId && projectIds.has(task.projectId) && !seenIds.has(task.projectId)) {
        seenIds.add(task.projectId)
        // Use project name from task if available, fallback to ID
        options.push({ id: task.projectId, name: task.projectId })
      }
    }
    // Sort by name
    options.sort((a, b) => a.name.localeCompare(b.name))
    // Add inbox option if there are tasks without project
    if (hasInboxTasks) {
      options.push({ id: 'inbox', name: 'Inbox (No Project)' })
    }
    return options
  }, [tasks])

  // Parse selected task project IDs from URL (reuse repos param for backwards compat)
  const selectedTaskProjectIds = useMemo(() => {
    return reposFilter?.split(',').filter(Boolean) ?? []
  }, [reposFilter])

  // Map repository path to repository ID for linking terminals to repositories
  const repoPathToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const repo of repositories) {
      map.set(repo.path, repo.id)
    }
    return map
  }, [repositories])

  // Map repository path to repo info for navigation and display
  const repoInfoByCwd = useMemo(() => {
    const map = new Map<string, {
      repoId: string
      repoName: string
      repoPath: string
    }>()
    for (const repo of repositories) {
      map.set(repo.path, {
        repoId: repo.id,
        repoName: repo.displayName,
        repoPath: repo.path,
      })
    }
    return map
  }, [repositories])

  // Parse selected repository IDs from URL
  const selectedRepoIds = useMemo(() => {
    return repoIdsFilter?.split(',').filter(Boolean) ?? []
  }, [repoIdsFilter])

  // Track which repository is currently loading (single repo at a time)
  const [loadingRepoId, setLoadingRepoId] = useState<string | null>(null)
  const loadingStartTimeRef = useRef<number>(0)
  const MIN_LOADING_DURATION = 400 // ms - minimum time to show spinner

  // Toggle a repository in the multi-select filter (max 6 repos)
  const toggleRepoFilter = useCallback(
    (repoId: string, checked: boolean) => {
      log.projectTerminals.info('toggleRepoFilter called', { repoId, checked })
      const currentIds = repoIdsFilter?.split(',').filter(Boolean) ?? []
      // Limit to 6 repos max
      if (checked && currentIds.length >= 6) return

      // Set loading state when adding a repo
      if (checked) {
        log.projectTerminals.info('Setting loadingRepoId', { repoId })
        loadingStartTimeRef.current = Date.now()
        setLoadingRepoId(repoId)
      }

      const newIds = checked
        ? [...currentIds, repoId]
        : currentIds.filter((id) => id !== repoId)
      navigate({
        to: '/terminals',
        search: (prev) => ({ ...prev, repoIds: newIds.length > 0 ? newIds.join(',') : undefined }),
        replace: true,
      })
    },
    [navigate, repoIdsFilter]
  )

  // Restore persisted repository selection when navigating to Repos tab with no URL param
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (activeTabId !== ALL_REPOS_TAB_ID) {
      hasRestoredRef.current = false
      return
    }
    // Wait for view state to load before attempting restoration
    if (isViewStateLoading) return
    // Only restore once per tab visit and only if URL has no repoIds param
    if (hasRestoredRef.current || repoIdsFilter) return
    if (persistedRepoIds.length === 0) return

    hasRestoredRef.current = true
    navigate({
      to: '/terminals',
      search: (prev) => ({ ...prev, repoIds: persistedRepoIds.join(',') }),
      replace: true,
    })
  }, [activeTabId, repoIdsFilter, persistedRepoIds, navigate, isViewStateLoading])

  // Persist repository selection to database when it changes
  useEffect(() => {
    if (activeTabId !== ALL_REPOS_TAB_ID) return
    // Don't persist while still loading or before restoration has had a chance to run
    if (isViewStateLoading) return
    // Don't persist if URL has no repoIds param and we haven't restored yet
    // (this prevents overwriting saved data before restoration completes)
    if (!repoIdsFilter && !hasRestoredRef.current && persistedRepoIds.length > 0) return
    // Only persist if different from what we have stored
    const current = selectedRepoIds.join(',')
    const persisted = persistedRepoIds.join(',')
    if (current === persisted) return

    setSelectedRepositories(selectedRepoIds)
  }, [activeTabId, selectedRepoIds, persistedRepoIds, setSelectedRepositories, isViewStateLoading, repoIdsFilter])

  // Auto-create terminals for selected repositories that don't have one
  useEffect(() => {
    if (activeTabId !== ALL_REPOS_TAB_ID) return
    if (!connected) return

    log.projectTerminals.debug('Auto-create effect running', {
      selectedRepoIds,
      terminalCount: terminals.length,
      terminalCwds: terminals.map(t => t.cwd),
    })

    for (const repoId of selectedRepoIds) {
      const repo = repositories.find((r) => r.id === repoId)
      if (!repo?.path) continue

      const repoPath = repo.path
      // Check if workspace terminal (no tabId) already exists for this repo
      const existingTerminal = terminals.find((t) => t.cwd === repoPath && !t.tabId)
      if (existingTerminal) {
        log.projectTerminals.debug('Terminal already exists for repo', { repoId, repoPath })
        continue
      }

      // Create terminal for this repo
      log.projectTerminals.info('Creating terminal for repo', { repoId, repoPath })
      createTerminal({
        name: repo.displayName,
        cwd: repoPath,
        cols: 80,
        rows: 24,
      })
    }
  }, [activeTabId, selectedRepoIds, repositories, terminals, connected, createTerminal])

  const cleanupFnsRef = useRef<Map<string, () => void>>(new Map())
  const terminalCountRef = useRef(0)
  // Guard against duplicate creations from React Strict Mode or double-click
  const pendingTerminalCreateRef = useRef(false)
  const pendingTabCreateRef = useRef(false)

  // Filter terminals for the active tab and convert to TerminalInfo for component compatibility
  const visibleTerminals = useMemo(() => {
    if (activeTabId === ALL_TASKS_TAB_ID) {
      // Show terminals for active tasks, sorted by newest task first, with optional project filter
      return terminals
        .filter((t) => t.cwd && activeTaskWorktrees.has(t.cwd))
        .filter((t) => {
          // If no filter selected, show all (default behavior)
          if (selectedTaskProjectIds.length === 0) return true
          const task = tasks.find((task) => task.worktreePath === t.cwd)
          if (!task) return false
          // Handle 'inbox' filter for tasks without project
          if (selectedTaskProjectIds.includes('inbox') && !task.projectId) return true
          return task.projectId && selectedTaskProjectIds.includes(task.projectId)
        })
        .sort((a, b) => {
          const taskA = tasks.find((t) => t.worktreePath === a.cwd)
          const taskB = tasks.find((t) => t.worktreePath === b.cwd)
          if (!taskA || !taskB) return 0
          return new Date(taskB.createdAt).getTime() - new Date(taskA.createdAt).getTime()
        })
        .map(toTerminalInfo)
    }
    if (activeTabId === ALL_REPOS_TAB_ID) {
      // Show workspace terminals (no tabId) for selected repos only
      if (selectedRepoIds.length === 0) return []
      return terminals
        .filter((t) => t.cwd && !t.tabId && repoPathToId.has(t.cwd))
        .filter((t) => {
          const repoId = repoPathToId.get(t.cwd!)
          return repoId && selectedRepoIds.includes(repoId)
        })
        .map(toTerminalInfo)
    }
    // Filter terminals by tabId, sorted by positionInTab
    return terminals
      .filter((t) => t.tabId === activeTabId)
      .sort((a, b) => a.positionInTab - b.positionInTab)
      .map(toTerminalInfo)
  }, [activeTabId, terminals, activeTaskWorktrees, selectedTaskProjectIds, tasks, repoPathToId, selectedRepoIds])

  // Clear loading state when terminal appears (with minimum duration)
  useEffect(() => {
    if (!loadingRepoId) return
    const repo = repositories.find(r => r.id === loadingRepoId)
    if (!repo?.path) return
    const repoPath = repo.path
    const hasTerminal = visibleTerminals.some(t => t.cwd === repoPath)
    log.projectTerminals.debug('Clear loading effect', {
      loadingRepoId,
      repoPath,
      hasTerminal,
      visibleTerminalCwds: visibleTerminals.map(t => t.cwd),
    })
    if (hasTerminal) {
      // Ensure minimum loading duration for visual feedback
      const elapsed = Date.now() - loadingStartTimeRef.current
      const remaining = MIN_LOADING_DURATION - elapsed
      if (remaining > 0) {
        const timer = setTimeout(() => {
          log.projectTerminals.info('Clearing loadingRepoId after delay', { loadingRepoId })
          setLoadingRepoId(null)
        }, remaining)
        return () => clearTimeout(timer)
      }
      log.projectTerminals.info('Clearing loadingRepoId', { loadingRepoId })
      setLoadingRepoId(null)
    }
  }, [loadingRepoId, repositories, visibleTerminals])

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

      // Auto-focus newly created terminals
      if (newTerminalIds.has(terminalId)) {
        // Small delay to ensure terminal is fully initialized
        setTimeout(() => {
          xterm.focus()
        }, 50)
      }
    },
    [attachXterm, newTerminalIds]
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
    // Quick create: generate name and create tab immediately (no modal)
    // Prevent duplicate creations from double-clicks or React Strict Mode
    if (pendingTabCreateRef.current) {
      log.terminal.debug('Skipping tab creation, already pending')
      return
    }
    pendingTabCreateRef.current = true

    const name = `Tab ${tabs.length + 1}`
    log.terminal.debug('Quick creating tab', { name })
    createTab(name, undefined, undefined) // No directory

    // Reset pending flag after a short delay to allow the creation to complete
    setTimeout(() => {
      pendingTabCreateRef.current = false
    }, 500)
  }, [createTab, tabs.length])

  const handleTabReorder = useCallback(
    (tabId: string, newPosition: number) => {
      log.terminal.debug('Reordering tab', { tabId, newPosition })
      reorderTab(tabId, newPosition)
    },
    [reorderTab]
  )

  const handleTabCreateConfirm = useCallback(
    (name: string, directory?: string) => {
      // Prevent duplicate creations from double-clicks or React Strict Mode
      if (pendingTabCreateRef.current) {
        log.terminal.debug('Skipping tab creation, already pending')
        return
      }
      pendingTabCreateRef.current = true

      log.terminal.debug('Creating tab', { name, directory })
      createTab(name, undefined, directory)

      // Reset pending flag after a short delay to allow the creation to complete
      setTimeout(() => {
        pendingTabCreateRef.current = false
      }, 500)
    },
    [createTab]
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

  // Keyboard shortcuts (Cmd+D/W only work on desktop - browser intercepts on web)
  const isSystemTab = activeTabId === ALL_TASKS_TAB_ID || activeTabId === ALL_REPOS_TAB_ID
  useHotkeys('meta+d', handleTerminalAdd, {
    enabled: !isSystemTab && connected,
    allowInTerminal: true,
    deps: [handleTerminalAdd, isSystemTab, connected],
  })

  useHotkeys('meta+w', () => {
    if (activeTabId && !isSystemTab) {
      const focusedId = getFocusedTerminal(activeTabId)
      if (focusedId) {
        handleTerminalClose(focusedId)
      }
    }
  }, {
    enabled: !isSystemTab,
    allowInTerminal: true,
    deps: [activeTabId, isSystemTab, getFocusedTerminal, handleTerminalClose],
  })

  return (
    <div className="flex h-full max-w-full flex-col overflow-hidden">
      {/* Tab Bar + Actions */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center">
          {/* Tasks system tab - always first, visually distinct */}
          <button
            onClick={() => setActiveTab(ALL_TASKS_TAB_ID)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-2',
              activeTabId === ALL_TASKS_TAB_ID
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/5',
              'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:transition-opacity',
              activeTabId === ALL_TASKS_TAB_ID ? 'after:opacity-100' : 'after:opacity-0'
            )}
          >
            <HugeiconsIcon icon={TaskDaily01Icon} size={12} strokeWidth={2} />
            <span className="max-sm:hidden">{t('taskTerminals')}</span>
          </button>
          {/* Repos system tab */}
          <button
            onClick={() => setActiveTab(ALL_REPOS_TAB_ID)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-2',
              activeTabId === ALL_REPOS_TAB_ID
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/5',
              'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:transition-opacity',
              activeTabId === ALL_REPOS_TAB_ID ? 'after:opacity-100' : 'after:opacity-0'
            )}
          >
            <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} />
            <span className="max-sm:hidden">{t('repoTerminals')}</span>
          </button>
          {/* Separator between system tabs and regular tabs */}
          <div className="mx-2 h-4 w-px shrink-0 bg-border" />
          <div className="min-w-0 flex-1">
            <TerminalTabBar
              tabs={tabBarTabs}
              activeTabId={activeTabId ?? ''}
              onTabSelect={setActiveTab}
              onTabClose={handleTabDelete}
              onTabCreate={handleTabCreate}
              onTabEdit={handleTabEdit}
              onTabReorder={handleTabReorder}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 max-sm:gap-1">
          {/* Project filter (only when Task Terminals is active and multiple projects exist) */}
          {activeTabId === ALL_TASKS_TAB_ID && taskProjectOptions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="max-sm:w-auto" />}
              >
                <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                <span>
                  {selectedTaskProjectIds.length === 0
                    ? t('allProjects')
                    : t('projectsSelected', { count: selectedTaskProjectIds.length })}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                <div className="p-2 space-y-2">
                  <div className="text-sm font-medium mb-2">{t('filterByRepo')}</div>
                  {taskProjectOptions.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`project-filter-${option.id}`}
                        checked={selectedTaskProjectIds.includes(option.id)}
                        onCheckedChange={(checked) => toggleTaskProjectFilter(option.id, checked === true)}
                      />
                      <Label
                        htmlFor={`project-filter-${option.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {option.name}
                      </Label>
                    </div>
                  ))}
                  {selectedTaskProjectIds.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => navigate({
                        to: '/terminals',
                        search: (prev) => ({ ...prev, repos: undefined }),
                        replace: true,
                      })}
                    >
                      {t('clearFilter')}
                    </Button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Repository filter (only when Repo Terminals is active) */}
          {activeTabId === ALL_REPOS_TAB_ID && repositories.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="max-sm:w-auto" />}
              >
                {loadingRepoId ? (
                  <HugeiconsIcon icon={Loading03Icon} size={12} strokeWidth={2} className="animate-spin text-muted-foreground" />
                ) : (
                  <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                )}
                <span>
                  {selectedRepoIds.length === 0
                    ? t('selectRepos')
                    : t('reposSelected', { count: selectedRepoIds.length })}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                <div className="p-2 space-y-2">
                  <div className="text-sm font-medium mb-2">{t('filterByRepo')}</div>
                  {repositories.map((repo) => {
                    const isSelected = selectedRepoIds.includes(repo.id)
                    const isLoading = loadingRepoId === repo.id
                    const isDisabled = loadingRepoId !== null || (!isSelected && selectedRepoIds.length >= 6)
                    return (
                      <div key={repo.id} className="flex items-center gap-2">
                        {isLoading ? (
                          <HugeiconsIcon
                            icon={Loading03Icon}
                            size={16}
                            strokeWidth={2}
                            className="animate-spin text-muted-foreground"
                          />
                        ) : (
                          <Checkbox
                            id={`repo-filter-${repo.id}`}
                            checked={isSelected}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => toggleRepoFilter(repo.id, checked === true)}
                          />
                        )}
                        <Label
                          htmlFor={`repo-filter-${repo.id}`}
                          className={`text-sm ${isDisabled ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {repo.displayName}
                        </Label>
                      </div>
                    )
                  })}
                  {selectedRepoIds.length > 0 && !loadingRepoId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => navigate({
                        to: '/terminals',
                        search: (prev) => ({ ...prev, repoIds: undefined }),
                        replace: true,
                      })}
                    >
                      {t('clearFilter')}
                    </Button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTerminalAdd}
            disabled={!connected || activeTabId === ALL_TASKS_TAB_ID || activeTabId === ALL_REPOS_TAB_ID}
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
          onTerminalClose={activeTabId === ALL_TASKS_TAB_ID || activeTabId === ALL_REPOS_TAB_ID ? undefined : handleTerminalClose}
          onTerminalAdd={connected && activeTabId !== ALL_TASKS_TAB_ID && activeTabId !== ALL_REPOS_TAB_ID ? handleTerminalAdd : undefined}
          onTerminalReady={handleTerminalReady}
          onTerminalResize={handleTerminalResize}
          onTerminalRename={activeTabId === ALL_TASKS_TAB_ID || activeTabId === ALL_REPOS_TAB_ID ? undefined : handleTerminalRename}
          setupImagePaste={setupImagePaste}
          writeToTerminal={writeToTerminal}
          sendInputToTerminal={sendInputToTerminal}
          taskInfoByCwd={activeTabId === ALL_TASKS_TAB_ID ? taskInfoByCwd : undefined}
          repoInfoByCwd={activeTabId === ALL_REPOS_TAB_ID ? repoInfoByCwd : undefined}
          emptyMessage={activeTabId === ALL_REPOS_TAB_ID ? t('emptyRepos') : activeTabId === ALL_TASKS_TAB_ID ? t('emptyTasks') : undefined}
        />
      </div>

      {/* Tab Edit Dialog */}
      <TabEditDialog
        tab={editingTab}
        open={editingTab !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTab(null)
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
    repos: typeof search.repos === 'string' ? search.repos : undefined,
    repoIds: typeof search.repoIds === 'string' ? search.repoIds : undefined,
  }),
})
