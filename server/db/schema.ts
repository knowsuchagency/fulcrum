import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('IN_PROGRESS'),
  position: integer('position').notNull(),
  repoPath: text('repo_path'), // Now nullable for non-worktree tasks
  repoName: text('repo_name'), // Now nullable for non-worktree tasks
  baseBranch: text('base_branch'), // Now nullable for non-worktree tasks
  branch: text('branch'),
  worktreePath: text('worktree_path'),
  viewState: text('view_state'), // JSON: { activeTab, browserUrl, diffOptions }
  prUrl: text('pr_url'), // GitHub PR URL for auto-completion tracking
  startupScript: text('startup_script'), // Command to run after worktree creation
  agent: text('agent').notNull().default('claude'), // AI agent: 'claude' | 'opencode'
  aiMode: text('ai_mode'), // 'default' | 'plan' | null - AI mode for agent startup
  agentOptions: text('agent_options'), // JSON: { [flag]: value } - CLI options for agent
  opencodeModel: text('opencode_model'), // OpenCode model in format 'provider/model' - null means use default
  pinned: integer('pinned', { mode: 'boolean' }).default(false), // Prevent cleanup from deleting this task's worktree
  // Generalized task management fields
  projectId: text('project_id'), // FK to projects (nullable - null = orphan/inbox)
  repositoryId: text('repository_id'), // FK to repositories for worktree tasks
  tags: text('tags'), // JSON array: ["bug", "urgent"]
  startedAt: text('started_at'), // Timestamp when moved out of TO_DO
  dueDate: text('due_date'), // YYYY-MM-DD format
  notes: text('notes'), // Free-form notes/comments
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Task relationships - tracks relationships between tasks (dependencies, related, subtasks)
export const taskRelationships = sqliteTable('task_relationships', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  relatedTaskId: text('related_task_id').notNull(),
  type: text('type').notNull().default('depends_on'), // 'depends_on' | 'relates_to' | 'subtask'
  createdAt: text('created_at').notNull(),
})

// Backwards compatibility alias
export const taskDependencies = taskRelationships

// Task links - arbitrary URL links associated with tasks
export const taskLinks = sqliteTable('task_links', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  url: text('url').notNull(),
  label: text('label'), // User-provided or auto-detected label
  type: text('type'), // 'pr' | 'issue' | 'docs' | 'design' | 'other'
  createdAt: text('created_at').notNull(),
})

// Task attachments - file uploads associated with tasks
export const taskAttachments = sqliteTable('task_attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  filename: text('filename').notNull(), // Original filename
  storedPath: text('stored_path').notNull(), // Full filesystem path
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(), // Bytes
  createdAt: text('created_at').notNull(),
})

// Project links - arbitrary URL links associated with projects
export const projectLinks = sqliteTable('project_links', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  url: text('url').notNull(),
  label: text('label'), // User-provided or auto-detected label
  type: text('type'), // 'pr' | 'issue' | 'docs' | 'design' | 'other'
  createdAt: text('created_at').notNull(),
})

// Project attachments - file uploads associated with projects
export const projectAttachments = sqliteTable('project_attachments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  filename: text('filename').notNull(), // Original filename
  storedPath: text('stored_path').notNull(), // Full filesystem path
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(), // Bytes
  createdAt: text('created_at').notNull(),
})

// Terminal tabs - first-class entities that can exist without terminals
export const terminalTabs = sqliteTable('terminal_tabs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0), // Tab order in the UI
  directory: text('directory'), // Optional default directory for terminals in this tab
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
  selectedRepositoryIds: text('selected_repository_ids'), // JSON array of repository IDs for "Repos" tab
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
  claudeOptions: text('claude_options'), // JSON: { [flag]: value } - CLI options for Claude Code
  opencodeOptions: text('opencode_options'), // JSON: { [flag]: value } - CLI options for OpenCode
  opencodeModel: text('opencode_model'), // OpenCode model in format 'provider/model' - null means use global default
  defaultAgent: text('default_agent'), // 'claude' | 'opencode' | null - null means use global default
  remoteUrl: text('remote_url'), // GitHub remote URL for filtering issues/PRs
  isCopierTemplate: integer('is_copier_template', { mode: 'boolean' }).default(false), // Mark as Copier template
  lastUsedAt: text('last_used_at'), // Timestamp of last task creation with this repo
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Apps - deployed applications from repositories
export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repositoryId: text('repository_id').notNull(), // FK to repositories
  branch: text('branch').notNull().default('main'),
  composeFile: text('compose_file').notNull(), // e.g., "compose.yml"
  status: text('status').notNull().default('stopped'), // stopped|building|running|failed
  autoDeployEnabled: integer('auto_deploy_enabled', { mode: 'boolean' }).default(false),
  autoPortAllocation: integer('auto_port_allocation', { mode: 'boolean' }).default(true),
  environmentVariables: text('environment_variables'), // JSON string: {"KEY": "value", ...}
  noCacheBuild: integer('no_cache_build', { mode: 'boolean' }).default(false),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  lastDeployedAt: text('last_deployed_at'),
  lastDeployCommit: text('last_deploy_commit'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// App services - individual services within a compose app
export const appServices = sqliteTable('app_services', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull(), // FK to apps
  serviceName: text('service_name').notNull(), // e.g., "web", "api"
  containerPort: integer('container_port'), // Port exposed by container
  exposed: integer('exposed', { mode: 'boolean' }).default(false),
  domain: text('domain'), // e.g., "myapp.example.com"
  exposureMethod: text('exposure_method').default('dns'), // 'dns' | 'tunnel'
  status: text('status').default('stopped'), // stopped|running|failed
  containerId: text('container_id'), // Docker container ID
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Deployments - deployment history for apps
export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull(), // FK to apps
  status: text('status').notNull(), // pending|building|running|failed|rolled_back
  gitCommit: text('git_commit'),
  gitMessage: text('git_message'),
  deployedBy: text('deployed_by'), // manual|auto|rollback
  buildLogs: text('build_logs'),
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
})

// Cloudflare Tunnels - one tunnel per app for multi-service ingress
export const tunnels = sqliteTable('tunnels', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().unique(), // FK to apps - one tunnel per app
  tunnelId: text('tunnel_id').notNull(), // Cloudflare tunnel UUID
  tunnelName: text('tunnel_name').notNull(), // e.g., "fulcrum-app-abc123"
  tunnelToken: text('tunnel_token').notNull(), // Token for cloudflared daemon
  status: text('status').notNull().default('inactive'), // inactive|active|failed
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Projects - unified entity wrapping optional repository + optional app + dedicated terminal
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  notes: text('notes'), // Free-form notes/comments
  repositoryId: text('repository_id'), // DEPRECATED: use projectRepositories join table
  appId: text('app_id').unique(), // FK to apps (nullable, 1:1)
  terminalTabId: text('terminal_tab_id').unique(), // FK to terminalTabs (dedicated)
  status: text('status').notNull().default('active'), // 'active' | 'archived'
  // Agent configuration - inherited by repositories unless overridden
  defaultAgent: text('default_agent'), // 'claude' | 'opencode' | null - null means use global default
  claudeOptions: text('claude_options'), // JSON: { [flag]: value } - CLI options for Claude Code
  opencodeOptions: text('opencode_options'), // JSON: { [flag]: value } - CLI options for OpenCode
  opencodeModel: text('opencode_model'), // OpenCode model in format 'provider/model' - null means use global default
  lastAccessedAt: text('last_accessed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Project Repositories - 1:N join table (each repository belongs to one project)
export const projectRepositories = sqliteTable('project_repositories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  repositoryId: text('repository_id').notNull().unique(), // Enforce 1:N - each repo belongs to one project
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
})

// Tags - reusable tags shared between tasks and projects
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'), // Optional color for visual distinction (e.g., "blue", "#3b82f6")
  createdAt: text('created_at').notNull(),
})

// Task Tags - M:N join table for tasks and tags
export const taskTags = sqliteTable('task_tags', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: text('created_at').notNull(),
})

// Project Tags - M:N join table for projects and tags
export const projectTags = sqliteTable('project_tags', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  tagId: text('tag_id').notNull(),
  createdAt: text('created_at').notNull(),
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
export type App = typeof apps.$inferSelect
export type NewApp = typeof apps.$inferInsert
export type AppService = typeof appServices.$inferSelect
export type NewAppService = typeof appServices.$inferInsert
export type Deployment = typeof deployments.$inferSelect
export type NewDeployment = typeof deployments.$inferInsert
export type Tunnel = typeof tunnels.$inferSelect
export type NewTunnel = typeof tunnels.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type TaskLink = typeof taskLinks.$inferSelect
export type NewTaskLink = typeof taskLinks.$inferInsert
export type TaskRelationship = typeof taskRelationships.$inferSelect
export type NewTaskRelationship = typeof taskRelationships.$inferInsert
// Backwards compatibility aliases
export type TaskDependency = TaskRelationship
export type NewTaskDependency = NewTaskRelationship
export type ProjectRepository = typeof projectRepositories.$inferSelect
export type NewProjectRepository = typeof projectRepositories.$inferInsert
export type TaskAttachment = typeof taskAttachments.$inferSelect
export type NewTaskAttachment = typeof taskAttachments.$inferInsert
export type ProjectAttachment = typeof projectAttachments.$inferSelect
export type NewProjectAttachment = typeof projectAttachments.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type TaskTag = typeof taskTags.$inferSelect
export type NewTaskTag = typeof taskTags.$inferInsert
export type ProjectTag = typeof projectTags.$inferSelect
export type NewProjectTag = typeof projectTags.$inferInsert
export type ProjectLink = typeof projectLinks.$inferSelect
export type NewProjectLink = typeof projectLinks.$inferInsert
