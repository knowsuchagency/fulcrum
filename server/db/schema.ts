import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('IN_PROGRESS'),
  position: integer('position').notNull(),
  repoPath: text('repo_path').notNull(),
  repoName: text('repo_name').notNull(),
  baseBranch: text('base_branch').notNull(),
  branch: text('branch'),
  worktreePath: text('worktree_path'),
  viewState: text('view_state'), // JSON: { activeTab, browserUrl, diffOptions }
  prUrl: text('pr_url'), // GitHub PR URL for auto-completion tracking
  linearTicketId: text('linear_ticket_id'), // e.g., "TEAM-123"
  linearTicketUrl: text('linear_ticket_url'), // Full URL for linking
  startupScript: text('startup_script'), // Command to run after worktree creation
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Terminal tabs - first-class entities that can exist without terminals
export const terminalTabs = sqliteTable('terminal_tabs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0), // Tab order in the UI
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const terminals = sqliteTable('terminals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cwd: text('cwd').notNull(),
  cols: integer('cols').notNull().default(80),
  rows: integer('rows').notNull().default(24),
  tmuxSession: text('tmux_session').notNull(),
  status: text('status').notNull().default('running'),
  exitCode: integer('exit_code'),
  // Tab association
  tabId: text('tab_id'), // References terminalTabs.id (nullable for orphaned terminals)
  positionInTab: integer('position_in_tab').default(0), // Order within the tab
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Terminal view state - singleton table for UI state persistence
export const terminalViewState = sqliteTable('terminal_view_state', {
  id: text('id').primaryKey().default('singleton'),
  activeTabId: text('active_tab_id'),
  focusedTerminals: text('focused_terminals'), // JSON: { [tabId]: terminalId }
  // View tracking for notification suppression
  currentView: text('current_view'), // 'task-detail' | 'terminals' | 'other'
  currentTaskId: text('current_task_id'), // Task ID if on task detail view
  isTabVisible: integer('is_tab_visible', { mode: 'boolean' }), // document.visibilityState
  viewUpdatedAt: text('view_updated_at'), // Timestamp to detect stale state
  updatedAt: text('updated_at').notNull(),
})

// Repositories - saved git repositories with startup configuration
export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  displayName: text('display_name').notNull(),
  startupScript: text('startup_script'), // Command to run after worktree creation
  copyFiles: text('copy_files'), // Comma-separated glob patterns (e.g., ".env, config.local.json")
  remoteUrl: text('remote_url'), // GitHub remote URL for filtering issues/PRs
  lastUsedAt: text('last_used_at'), // Timestamp of last task creation with this repo
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// System metrics for monitoring - stores historical CPU, memory, disk usage
export const systemMetrics = sqliteTable('system_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(), // Unix timestamp in seconds
  cpuPercent: real('cpu_percent').notNull(),
  memoryUsedBytes: integer('memory_used_bytes').notNull(),
  memoryTotalBytes: integer('memory_total_bytes').notNull(),
  memoryCacheBytes: integer('memory_cache_bytes').notNull().default(0), // Cache + Buffers
  diskUsedBytes: integer('disk_used_bytes').notNull(),
  diskTotalBytes: integer('disk_total_bytes').notNull(),
})

// Type inference helpers
export type Repository = typeof repositories.$inferSelect
export type NewRepository = typeof repositories.$inferInsert
export type SystemMetric = typeof systemMetrics.$inferSelect
export type NewSystemMetric = typeof systemMetrics.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TerminalTab = typeof terminalTabs.$inferSelect
export type NewTerminalTab = typeof terminalTabs.$inferInsert
export type Terminal = typeof terminals.$inferSelect
export type NewTerminal = typeof terminals.$inferInsert
export type TerminalViewState = typeof terminalViewState.$inferSelect
export type NewTerminalViewState = typeof terminalViewState.$inferInsert
