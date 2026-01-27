/**
 * MCP Tool Registry
 *
 * Manages tool metadata for deferred loading and search functionality.
 * Core tools are always loaded; deferred tools are loaded on-demand after search.
 */

export type ToolCategory = 'core' | 'tasks' | 'projects' | 'repositories' | 'apps' | 'filesystem' | 'git' | 'notifications' | 'exec' | 'settings' | 'backup' | 'email' | 'messaging' | 'assistant'

export interface ToolMetadata {
  name: string
  description: string
  category: ToolCategory
  keywords: string[]
  /** When true, this tool can be deferred and discovered via search_tools */
  defer_loading: boolean
}

// Tool metadata registry
// Core tools (defer_loading: false) are always registered
// Deferred tools (defer_loading: true) are discovered via search_tools
export const toolRegistry: ToolMetadata[] = [
  // Core tools - always loaded
  {
    name: 'search_tools',
    description: 'Search for available Fulcrum MCP tools by keyword or category',
    category: 'core',
    keywords: ['search', 'find', 'discover', 'tools', 'help'],
    defer_loading: false,
  },
  {
    name: 'list_tasks',
    description: 'List all Fulcrum tasks with flexible filtering (search, tags, statuses, date range, overdue)',
    category: 'tasks',
    keywords: ['task', 'list', 'kanban', 'worktree', 'status', 'search', 'tags', 'due date', 'overdue', 'filter'],
    defer_loading: false,
  },
  {
    name: 'get_task',
    description: 'Get details of a specific task by ID',
    category: 'tasks',
    keywords: ['task', 'get', 'details', 'worktree'],
    defer_loading: false,
  },
  {
    name: 'create_task',
    description: 'Create a new task with a git worktree',
    category: 'tasks',
    keywords: ['task', 'create', 'new', 'worktree', 'branch'],
    defer_loading: false,
  },
  {
    name: 'update_task',
    description: 'Update task metadata (title, description)',
    category: 'tasks',
    keywords: ['task', 'update', 'edit', 'modify'],
    defer_loading: false,
  },
  {
    name: 'delete_task',
    description: 'Delete a task and optionally its worktree',
    category: 'tasks',
    keywords: ['task', 'delete', 'remove', 'worktree'],
    defer_loading: false,
  },
  {
    name: 'move_task',
    description: 'Move a task to a different status column',
    category: 'tasks',
    keywords: ['task', 'move', 'status', 'kanban', 'progress', 'review', 'done'],
    defer_loading: false,
  },
  {
    name: 'execute_command',
    description: 'Execute a CLI command with optional persistent session',
    category: 'exec',
    keywords: ['command', 'exec', 'run', 'shell', 'terminal', 'bash'],
    defer_loading: false,
  },
  {
    name: 'send_notification',
    description: 'Send a notification to all enabled channels',
    category: 'notifications',
    keywords: ['notify', 'alert', 'message', 'slack', 'discord'],
    defer_loading: false,
  },

  // Project tools - deferred
  {
    name: 'list_projects',
    description: 'List all Fulcrum projects with optional filtering by status',
    category: 'projects',
    keywords: ['project', 'list', 'repository', 'repo'],
    defer_loading: true,
  },
  {
    name: 'get_project',
    description: 'Get details of a specific project by ID',
    category: 'projects',
    keywords: ['project', 'get', 'details', 'repository'],
    defer_loading: true,
  },
  {
    name: 'create_project',
    description: 'Create a new project from a local path, git URL, or existing repository',
    category: 'projects',
    keywords: ['project', 'create', 'new', 'clone', 'repository'],
    defer_loading: true,
  },
  {
    name: 'update_project',
    description: 'Update project metadata (name, description, or status)',
    category: 'projects',
    keywords: ['project', 'update', 'edit', 'archive'],
    defer_loading: true,
  },
  {
    name: 'delete_project',
    description: 'Delete a project and optionally its directory and app',
    category: 'projects',
    keywords: ['project', 'delete', 'remove'],
    defer_loading: true,
  },
  {
    name: 'scan_projects',
    description: 'Scan a directory for git repositories',
    category: 'projects',
    keywords: ['project', 'scan', 'find', 'discover', 'repository', 'git'],
    defer_loading: true,
  },
  {
    name: 'add_project_tag',
    description: 'Add a tag to a project',
    category: 'projects',
    keywords: ['project', 'tag', 'add', 'label', 'categorize'],
    defer_loading: true,
  },
  {
    name: 'remove_project_tag',
    description: 'Remove a tag from a project',
    category: 'projects',
    keywords: ['project', 'tag', 'remove', 'delete', 'label'],
    defer_loading: true,
  },
  {
    name: 'list_project_attachments',
    description: 'List all file attachments for a project',
    category: 'projects',
    keywords: ['project', 'attachment', 'file', 'upload', 'document', 'list'],
    defer_loading: true,
  },
  {
    name: 'upload_project_attachment',
    description: 'Upload a file to a project from a local path',
    category: 'projects',
    keywords: ['project', 'attachment', 'file', 'upload', 'document', 'add'],
    defer_loading: true,
  },
  {
    name: 'delete_project_attachment',
    description: 'Delete a file attachment from a project',
    category: 'projects',
    keywords: ['project', 'attachment', 'file', 'delete', 'remove'],
    defer_loading: true,
  },
  {
    name: 'get_project_attachment_path',
    description: 'Get the local file path for a project attachment',
    category: 'projects',
    keywords: ['project', 'attachment', 'file', 'path', 'read'],
    defer_loading: true,
  },

  // App tools - deferred
  {
    name: 'list_apps',
    description: 'List all deployed apps with optional filtering by status',
    category: 'apps',
    keywords: ['app', 'list', 'deploy', 'docker', 'container'],
    defer_loading: true,
  },
  {
    name: 'get_app',
    description: 'Get details of a specific app including services and repository',
    category: 'apps',
    keywords: ['app', 'get', 'details', 'service', 'container'],
    defer_loading: true,
  },
  {
    name: 'create_app',
    description: 'Create a new app for deployment from a repository',
    category: 'apps',
    keywords: ['app', 'create', 'new', 'deploy', 'docker', 'compose'],
    defer_loading: true,
  },
  {
    name: 'deploy_app',
    description: 'Trigger a deployment for an app',
    category: 'apps',
    keywords: ['app', 'deploy', 'build', 'start', 'run'],
    defer_loading: true,
  },
  {
    name: 'stop_app',
    description: 'Stop a running app',
    category: 'apps',
    keywords: ['app', 'stop', 'halt', 'shutdown'],
    defer_loading: true,
  },
  {
    name: 'get_app_logs',
    description: 'Get logs from an app, optionally for a specific service',
    category: 'apps',
    keywords: ['app', 'logs', 'output', 'debug', 'service'],
    defer_loading: true,
  },
  {
    name: 'get_app_status',
    description: 'Get the current container status for an app',
    category: 'apps',
    keywords: ['app', 'status', 'container', 'running', 'replicas'],
    defer_loading: true,
  },
  {
    name: 'list_deployments',
    description: 'Get deployment history for an app',
    category: 'apps',
    keywords: ['app', 'deploy', 'history', 'rollback'],
    defer_loading: true,
  },
  {
    name: 'delete_app',
    description: 'Delete an app and optionally stop its containers',
    category: 'apps',
    keywords: ['app', 'delete', 'remove', 'destroy'],
    defer_loading: true,
  },

  // Filesystem tools - deferred
  {
    name: 'list_directory',
    description: 'List contents of a directory',
    category: 'filesystem',
    keywords: ['file', 'directory', 'list', 'ls', 'folder'],
    defer_loading: true,
  },
  {
    name: 'get_file_tree',
    description: 'Get recursive file tree for a directory',
    category: 'filesystem',
    keywords: ['file', 'tree', 'directory', 'structure', 'recursive'],
    defer_loading: true,
  },
  {
    name: 'read_file',
    description: 'Read file contents (with path traversal protection)',
    category: 'filesystem',
    keywords: ['file', 'read', 'content', 'cat', 'view'],
    defer_loading: true,
  },
  {
    name: 'write_file',
    description: 'Write content to an existing file (with path traversal protection)',
    category: 'filesystem',
    keywords: ['file', 'write', 'save', 'modify'],
    defer_loading: true,
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing an exact string (must be unique in file)',
    category: 'filesystem',
    keywords: ['file', 'edit', 'replace', 'modify', 'change', 'update'],
    defer_loading: true,
  },
  {
    name: 'file_stat',
    description: 'Get file or directory metadata',
    category: 'filesystem',
    keywords: ['file', 'stat', 'info', 'metadata', 'exists'],
    defer_loading: true,
  },
  {
    name: 'is_git_repo',
    description: 'Check if a directory is a git repository',
    category: 'filesystem',
    keywords: ['git', 'repository', 'check', 'verify'],
    defer_loading: true,
  },

  // Repository tools
  {
    name: 'list_repositories',
    description: 'List all configured repositories (supports orphans filter)',
    category: 'repositories',
    keywords: ['repository', 'repo', 'list', 'git', 'orphan', 'unlinked'],
    defer_loading: false,
  },
  {
    name: 'get_repository',
    description: 'Get details of a specific repository by ID',
    category: 'repositories',
    keywords: ['repository', 'repo', 'get', 'details'],
    defer_loading: true,
  },
  {
    name: 'add_repository',
    description: 'Add a repository from a local path',
    category: 'repositories',
    keywords: ['repository', 'repo', 'add', 'create', 'register'],
    defer_loading: true,
  },
  {
    name: 'update_repository',
    description: 'Update repository metadata',
    category: 'repositories',
    keywords: ['repository', 'repo', 'update', 'edit', 'modify', 'agent'],
    defer_loading: true,
  },
  {
    name: 'delete_repository',
    description: 'Delete an orphaned repository',
    category: 'repositories',
    keywords: ['repository', 'repo', 'delete', 'remove', 'orphan'],
    defer_loading: true,
  },
  {
    name: 'link_repository_to_project',
    description: 'Link a repository to a project',
    category: 'repositories',
    keywords: ['repository', 'repo', 'link', 'project', 'associate', 'connect'],
    defer_loading: true,
  },
  {
    name: 'unlink_repository_from_project',
    description: 'Unlink a repository from a project',
    category: 'repositories',
    keywords: ['repository', 'repo', 'unlink', 'project', 'disconnect', 'detach'],
    defer_loading: true,
  },

  // Additional core tools
  {
    name: 'list_exec_sessions',
    description: 'List active command execution sessions',
    category: 'exec',
    keywords: ['session', 'exec', 'command', 'list'],
    defer_loading: false,
  },
  {
    name: 'update_exec_session',
    description: 'Update an execution session (e.g., rename)',
    category: 'exec',
    keywords: ['session', 'exec', 'update', 'rename'],
    defer_loading: false,
  },
  {
    name: 'destroy_exec_session',
    description: 'Destroy a command execution session',
    category: 'exec',
    keywords: ['session', 'exec', 'destroy', 'delete', 'close'],
    defer_loading: false,
  },
  {
    name: 'add_task_link',
    description: 'Add a URL link to a task',
    category: 'tasks',
    keywords: ['task', 'link', 'url', 'pr'],
    defer_loading: false,
  },
  {
    name: 'remove_task_link',
    description: 'Remove a URL link from a task',
    category: 'tasks',
    keywords: ['task', 'link', 'remove', 'delete'],
    defer_loading: false,
  },
  {
    name: 'list_task_links',
    description: 'List all URL links attached to a task',
    category: 'tasks',
    keywords: ['task', 'link', 'list', 'url'],
    defer_loading: false,
  },
  {
    name: 'add_task_tag',
    description: 'Add a tag to a task',
    category: 'tasks',
    keywords: ['task', 'tag', 'add', 'categorize'],
    defer_loading: false,
  },
  {
    name: 'remove_task_tag',
    description: 'Remove a tag from a task',
    category: 'tasks',
    keywords: ['task', 'tag', 'remove', 'delete'],
    defer_loading: false,
  },
  {
    name: 'set_task_due_date',
    description: 'Set or clear the due date for a task',
    category: 'tasks',
    keywords: ['task', 'due', 'date', 'deadline', 'schedule'],
    defer_loading: false,
  },
  {
    name: 'get_task_dependencies',
    description: 'Get dependencies and dependents for a task',
    category: 'tasks',
    keywords: ['task', 'dependency', 'depends', 'blocked', 'blocking'],
    defer_loading: false,
  },
  {
    name: 'add_task_dependency',
    description: 'Add a dependency between tasks',
    category: 'tasks',
    keywords: ['task', 'dependency', 'add', 'depends', 'block'],
    defer_loading: false,
  },
  {
    name: 'remove_task_dependency',
    description: 'Remove a dependency between tasks',
    category: 'tasks',
    keywords: ['task', 'dependency', 'remove', 'delete', 'unblock'],
    defer_loading: false,
  },
  {
    name: 'get_task_dependency_graph',
    description: 'Get the full task dependency graph for visualization',
    category: 'tasks',
    keywords: ['task', 'dependency', 'graph', 'visualization', 'dag'],
    defer_loading: false,
  },
  {
    name: 'list_tasks_by_tag',
    description: 'List tasks filtered by a specific tag',
    category: 'tasks',
    keywords: ['task', 'tag', 'filter', 'search'],
    defer_loading: false,
  },
  {
    name: 'list_tasks_by_due_date',
    description: 'List tasks filtered by due date range',
    category: 'tasks',
    keywords: ['task', 'due', 'date', 'filter', 'deadline', 'overdue'],
    defer_loading: false,
  },
  {
    name: 'list_tags',
    description: 'List all unique tags in use across tasks with optional search',
    category: 'tasks',
    keywords: ['tags', 'categories', 'filter', 'search', 'discover'],
    defer_loading: false,
  },
  {
    name: 'list_task_attachments',
    description: 'List all file attachments for a task',
    category: 'tasks',
    keywords: ['task', 'attachment', 'file', 'upload', 'document', 'list'],
    defer_loading: false,
  },
  {
    name: 'upload_task_attachment',
    description: 'Upload a file to a task from a local path',
    category: 'tasks',
    keywords: ['task', 'attachment', 'file', 'upload', 'document', 'add'],
    defer_loading: false,
  },
  {
    name: 'delete_task_attachment',
    description: 'Delete a file attachment from a task',
    category: 'tasks',
    keywords: ['task', 'attachment', 'file', 'delete', 'remove'],
    defer_loading: false,
  },
  {
    name: 'get_task_attachment_path',
    description: 'Get the local file path for a task attachment',
    category: 'tasks',
    keywords: ['task', 'attachment', 'file', 'path', 'read'],
    defer_loading: false,
  },

  // Settings tools
  {
    name: 'list_settings',
    description: 'List all Fulcrum settings with current values',
    category: 'settings',
    keywords: ['settings', 'config', 'configuration', 'preferences', 'list', 'all'],
    defer_loading: false,
  },
  {
    name: 'get_setting',
    description: 'Get the value of a specific setting',
    category: 'settings',
    keywords: ['settings', 'config', 'get', 'read', 'value'],
    defer_loading: false,
  },
  {
    name: 'update_setting',
    description: 'Update a setting value',
    category: 'settings',
    keywords: ['settings', 'config', 'update', 'set', 'change', 'modify'],
    defer_loading: false,
  },
  {
    name: 'reset_setting',
    description: 'Reset a setting to its default value',
    category: 'settings',
    keywords: ['settings', 'config', 'reset', 'default', 'clear'],
    defer_loading: false,
  },
  {
    name: 'get_notification_settings',
    description: 'Get notification channel settings',
    category: 'settings',
    keywords: ['settings', 'notifications', 'slack', 'discord', 'pushover', 'sound', 'alert'],
    defer_loading: false,
  },
  {
    name: 'update_notification_settings',
    description: 'Update notification channel settings',
    category: 'settings',
    keywords: ['settings', 'notifications', 'slack', 'discord', 'pushover', 'sound', 'update', 'enable', 'disable'],
    defer_loading: false,
  },

  // Project link tools
  {
    name: 'list_project_links',
    description: 'List all URL links attached to a project',
    category: 'projects',
    keywords: ['project', 'link', 'url', 'list'],
    defer_loading: true,
  },
  {
    name: 'add_project_link',
    description: 'Add a URL link to a project',
    category: 'projects',
    keywords: ['project', 'link', 'url', 'add'],
    defer_loading: true,
  },
  {
    name: 'remove_project_link',
    description: 'Remove a URL link from a project',
    category: 'projects',
    keywords: ['project', 'link', 'url', 'remove', 'delete'],
    defer_loading: true,
  },

  // Backup tools
  {
    name: 'list_backups',
    description: 'List all available backups',
    category: 'backup',
    keywords: ['backup', 'list', 'restore', 'database', 'settings', 'recovery'],
    defer_loading: false,
  },
  {
    name: 'create_backup',
    description: 'Create a new backup of database and settings',
    category: 'backup',
    keywords: ['backup', 'create', 'save', 'database', 'settings', 'snapshot'],
    defer_loading: false,
  },
  {
    name: 'get_backup',
    description: 'Get details of a specific backup',
    category: 'backup',
    keywords: ['backup', 'get', 'details', 'info'],
    defer_loading: false,
  },
  {
    name: 'restore_backup',
    description: 'Restore database and/or settings from a backup',
    category: 'backup',
    keywords: ['backup', 'restore', 'recovery', 'database', 'settings', 'rollback'],
    defer_loading: false,
  },
  {
    name: 'delete_backup',
    description: 'Delete a backup',
    category: 'backup',
    keywords: ['backup', 'delete', 'remove', 'cleanup'],
    defer_loading: false,
  },

  // Email tools
  {
    name: 'list_emails',
    description: 'List stored emails from the local database',
    category: 'email',
    keywords: ['email', 'list', 'inbox', 'sent', 'message', 'mail'],
    defer_loading: false,
  },
  {
    name: 'get_email',
    description: 'Get a specific email by ID',
    category: 'email',
    keywords: ['email', 'get', 'read', 'view', 'message', 'mail'],
    defer_loading: false,
  },
  {
    name: 'search_emails',
    description: 'Search emails via IMAP and store results locally',
    category: 'email',
    keywords: ['email', 'search', 'find', 'query', 'imap', 'message', 'mail'],
    defer_loading: false,
  },
  {
    name: 'fetch_emails',
    description: 'Fetch specific emails by IMAP UID and store locally',
    category: 'email',
    keywords: ['email', 'fetch', 'download', 'imap', 'uid', 'message', 'mail'],
    defer_loading: false,
  },

  // Concierge tools - proactive digital concierge
  {
    name: 'message',
    description: 'Send a message to a messaging channel (email, WhatsApp, etc.)',
    category: 'assistant',
    keywords: ['message', 'send', 'reply', 'email', 'whatsapp', 'communicate', 'respond'],
    defer_loading: false,
  },
  {
    name: 'create_actionable_event',
    description: 'Create an actionable event to track something noticed',
    category: 'assistant',
    keywords: ['event', 'actionable', 'track', 'remember', 'log', 'decision', 'memory'],
    defer_loading: false,
  },
  {
    name: 'list_actionable_events',
    description: 'List actionable events by status or channel',
    category: 'assistant',
    keywords: ['event', 'actionable', 'list', 'pending', 'review', 'memory'],
    defer_loading: false,
  },
  {
    name: 'get_actionable_event',
    description: 'Get details of a specific actionable event',
    category: 'assistant',
    keywords: ['event', 'actionable', 'get', 'details', 'history'],
    defer_loading: false,
  },
  {
    name: 'update_actionable_event',
    description: 'Update an actionable event status or link to a task',
    category: 'assistant',
    keywords: ['event', 'actionable', 'update', 'status', 'link', 'task', 'log'],
    defer_loading: false,
  },
  {
    name: 'get_assistant_stats',
    description: 'Get assistant statistics: event counts by status and last sweep times',
    category: 'assistant',
    keywords: ['assistant', 'stats', 'statistics', 'events', 'sweep', 'summary'],
    defer_loading: false,
  },
  {
    name: 'get_last_sweep',
    description: 'Get information about the last sweep run of a type',
    category: 'assistant',
    keywords: ['sweep', 'last', 'hourly', 'morning', 'evening', 'ritual'],
    defer_loading: false,
  },
]

/**
 * Search tools by query string.
 * Matches against name, description, and keywords.
 */
export function searchTools(query: string): ToolMetadata[] {
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/).filter(Boolean)

  return toolRegistry.filter((tool) => {
    const searchableText = [
      tool.name,
      tool.description,
      tool.category,
      ...tool.keywords,
    ]
      .join(' ')
      .toLowerCase()

    // Match if all query terms are found somewhere in the searchable text
    return queryTerms.every((term) => searchableText.includes(term))
  })
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolCategory): ToolMetadata[] {
  return toolRegistry.filter((tool) => tool.category === category)
}

/**
 * Get all core (non-deferred) tools
 */
export function getCoreTools(): ToolMetadata[] {
  return toolRegistry.filter((tool) => !tool.defer_loading)
}

/**
 * Get all deferred tools
 */
export function getDeferredTools(): ToolMetadata[] {
  return toolRegistry.filter((tool) => tool.defer_loading)
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolMetadata | undefined {
  return toolRegistry.find((tool) => tool.name === name)
}
