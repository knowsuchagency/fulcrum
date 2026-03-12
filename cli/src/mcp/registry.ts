/**
 * MCP Tool Registry
 *
 * Manages tool metadata for deferred loading and search functionality.
 * Core tools are always loaded; deferred tools are loaded on-demand after search.
 */

export type ToolCategory = 'core' | 'tasks' | 'projects' | 'repositories' | 'apps' | 'filesystem' | 'git' | 'notifications' | 'exec' | 'settings' | 'backup' | 'email' | 'messaging' | 'assistant' | 'caldav' | 'memory' | 'jobs' | 'board'

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
    keywords: ['notify', 'alert', 'message', 'slack', 'discord', 'gmail'],
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
    name: 'update_app',
    description: 'Update app settings including service exposure, environment variables, and deployment options',
    category: 'apps',
    keywords: ['app', 'update', 'configure', 'service', 'exposure', 'domain', 'tunnel', 'dns', 'environment'],
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

  // Copier template tools
  {
    name: 'list_templates',
    description: 'List available Copier project templates',
    category: 'repositories',
    keywords: ['template', 'copier', 'scaffold', 'boilerplate', 'list'],
    defer_loading: true,
  },
  {
    name: 'get_template_questions',
    description: 'Get questions/prompts defined by a Copier template',
    category: 'repositories',
    keywords: ['template', 'copier', 'questions', 'prompts', 'answers', 'scaffold'],
    defer_loading: true,
  },
  {
    name: 'create_from_template',
    description: 'Create a new project from a Copier template',
    category: 'repositories',
    keywords: ['template', 'copier', 'create', 'scaffold', 'project', 'boilerplate', 'generate'],
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
    name: 'delete_tag',
    description: 'Delete a tag from the database and all its associations',
    category: 'tasks',
    keywords: ['tag', 'delete', 'remove', 'cleanup'],
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
    keywords: ['settings', 'notifications', 'slack', 'discord', 'pushover', 'gmail', 'sound', 'alert'],
    defer_loading: false,
  },
  {
    name: 'update_notification_settings',
    description: 'Update notification channel settings',
    category: 'settings',
    keywords: ['settings', 'notifications', 'slack', 'discord', 'pushover', 'whatsapp', 'telegram', 'gmail', 'sound', 'update', 'enable', 'disable'],
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

  // Messaging tools
  {
    name: 'get_message',
    description: 'Get details of a specific message by ID, including full content and metadata',
    category: 'messaging',
    keywords: ['message', 'get', 'read', 'channel', 'whatsapp', 'discord', 'telegram', 'slack', 'chat'],
    defer_loading: false,
  },

  // Concierge tools - proactive digital concierge
  {
    name: 'message',
    description: 'Send a message to a messaging channel (WhatsApp, Discord, Telegram, Slack, Gmail)',
    category: 'assistant',
    keywords: ['message', 'send', 'reply', 'whatsapp', 'gmail', 'email', 'communicate', 'respond'],
    defer_loading: false,
  },
  {
    name: 'get_last_sweep',
    description: 'Get information about the last sweep run of a type',
    category: 'assistant',
    keywords: ['sweep', 'last', 'hourly', 'morning', 'evening', 'ritual'],
    defer_loading: false,
  },
  // CalDAV account tools
  {
    name: 'list_caldav_accounts',
    description: 'List all CalDAV accounts configured for calendar sync',
    category: 'caldav',
    keywords: ['caldav', 'account', 'list', 'calendar', 'google', 'nextcloud'],
    defer_loading: true,
  },
  {
    name: 'create_caldav_account',
    description: 'Create a new CalDAV account with basic authentication',
    category: 'caldav',
    keywords: ['caldav', 'account', 'create', 'add', 'calendar', 'connect'],
    defer_loading: true,
  },
  {
    name: 'delete_caldav_account',
    description: 'Delete a CalDAV account and all its calendars and events',
    category: 'caldav',
    keywords: ['caldav', 'account', 'delete', 'remove', 'disconnect'],
    defer_loading: true,
  },
  {
    name: 'sync_caldav_account',
    description: 'Trigger a manual sync for a specific CalDAV account',
    category: 'caldav',
    keywords: ['caldav', 'account', 'sync', 'refresh', 'calendar'],
    defer_loading: true,
  },
  // CalDAV copy rule tools
  {
    name: 'list_caldav_copy_rules',
    description: 'List all CalDAV copy rules for one-way event replication between calendars',
    category: 'caldav',
    keywords: ['caldav', 'copy', 'rule', 'list', 'replicate', 'sync', 'calendar'],
    defer_loading: true,
  },
  {
    name: 'create_caldav_copy_rule',
    description: 'Create a copy rule to replicate events from one calendar to another',
    category: 'caldav',
    keywords: ['caldav', 'copy', 'rule', 'create', 'replicate', 'calendar'],
    defer_loading: true,
  },
  {
    name: 'delete_caldav_copy_rule',
    description: 'Delete a CalDAV copy rule',
    category: 'caldav',
    keywords: ['caldav', 'copy', 'rule', 'delete', 'remove'],
    defer_loading: true,
  },
  {
    name: 'execute_caldav_copy_rule',
    description: 'Manually execute a copy rule to replicate events now',
    category: 'caldav',
    keywords: ['caldav', 'copy', 'rule', 'execute', 'run', 'replicate'],
    defer_loading: true,
  },
  // CalDAV calendar tools
  {
    name: 'list_calendars',
    description: 'List all CalDAV calendars synced from the configured server',
    category: 'caldav',
    keywords: ['calendar', 'caldav', 'list', 'schedule'],
    defer_loading: true,
  },
  {
    name: 'sync_calendars',
    description: 'Trigger a manual sync of all CalDAV calendars and events',
    category: 'caldav',
    keywords: ['calendar', 'caldav', 'sync', 'refresh', 'update'],
    defer_loading: true,
  },
  {
    name: 'list_calendar_events',
    description: 'List calendar events with optional filtering by calendar, date range, or limit',
    category: 'caldav',
    keywords: ['calendar', 'event', 'list', 'schedule', 'appointment', 'meeting'],
    defer_loading: true,
  },
  {
    name: 'get_calendar_event',
    description: 'Get details of a specific calendar event by ID',
    category: 'caldav',
    keywords: ['calendar', 'event', 'get', 'details', 'appointment'],
    defer_loading: true,
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event on a CalDAV or Google calendar.',
    category: 'caldav',
    keywords: ['calendar', 'event', 'create', 'new', 'schedule', 'appointment', 'meeting'],
    defer_loading: true,
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event',
    category: 'caldav',
    keywords: ['calendar', 'event', 'update', 'edit', 'modify', 'reschedule'],
    defer_loading: true,
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event',
    category: 'caldav',
    keywords: ['calendar', 'event', 'delete', 'remove', 'cancel'],
    defer_loading: true,
  },
  // Memory tools - always loaded
  {
    name: 'memory_store',
    description: 'Store a piece of knowledge in persistent memory',
    category: 'memory',
    keywords: ['memory', 'store', 'save', 'remember', 'knowledge', 'persist', 'fact'],
    defer_loading: false,
  },
  {
    name: 'memory_search',
    description: 'Search persistent memories using full-text search (FTS5)',
    category: 'memory',
    keywords: ['memory', 'search', 'find', 'query', 'fts', 'recall', 'knowledge'],
    defer_loading: false,
  },
  {
    name: 'memory_list',
    description: 'List persistent memories with optional tag filter',
    category: 'memory',
    keywords: ['memory', 'list', 'browse', 'tags', 'filter', 'all'],
    defer_loading: false,
  },
  {
    name: 'memory_delete',
    description: 'Delete a persistent memory by ID',
    category: 'memory',
    keywords: ['memory', 'delete', 'remove', 'clean', 'resolved', 'outdated'],
    defer_loading: false,
  },
  {
    name: 'memory_file_read',
    description: 'Read the master memory file (MEMORY.md)',
    category: 'memory',
    keywords: ['memory', 'file', 'read', 'instructions', 'preferences', 'persistent', 'knowledge'],
    defer_loading: false,
  },
  {
    name: 'memory_file_update',
    description: 'Update the master memory file (whole or by section)',
    category: 'memory',
    keywords: ['memory', 'file', 'update', 'write', 'edit', 'section', 'instructions', 'preferences'],
    defer_loading: false,
  },
  {
    name: 'search',
    description: 'Search across all Fulcrum entities (tasks, projects, messages, events, memories, gmail) using full-text search',
    category: 'core',
    keywords: ['search', 'find', 'query', 'fts', 'full-text', 'task', 'project', 'message', 'event', 'memory', 'recall', 'knowledge', 'gmail', 'email', 'google'],
    defer_loading: false,
  },

  // Gmail / Google Account tools
  {
    name: 'list_google_accounts',
    description: 'List all configured Google accounts',
    category: 'email',
    keywords: ['google', 'account', 'list', 'gmail', 'calendar', 'oauth'],
    defer_loading: true,
  },
  {
    name: 'list_gmail_drafts',
    description: 'List Gmail drafts for a Google account',
    category: 'email',
    keywords: ['gmail', 'draft', 'list', 'email', 'google'],
    defer_loading: true,
  },
  {
    name: 'create_gmail_draft',
    description: 'Create a new Gmail draft email',
    category: 'email',
    keywords: ['gmail', 'draft', 'create', 'compose', 'email', 'google'],
    defer_loading: true,
  },
  {
    name: 'update_gmail_draft',
    description: 'Update an existing Gmail draft',
    category: 'email',
    keywords: ['gmail', 'draft', 'update', 'edit', 'email', 'google'],
    defer_loading: true,
  },
  {
    name: 'delete_gmail_draft',
    description: 'Delete a Gmail draft',
    category: 'email',
    keywords: ['gmail', 'draft', 'delete', 'remove', 'email', 'google'],
    defer_loading: true,
  },

  // Job scheduling tools
  {
    name: 'list_jobs',
    description: 'List scheduled jobs (systemd timers on Linux, launchd on macOS)',
    category: 'jobs',
    keywords: ['job', 'timer', 'schedule', 'cron', 'systemd', 'launchd', 'list'],
    defer_loading: true,
  },
  {
    name: 'get_job',
    description: 'Get details of a scheduled job including schedule, command, and execution stats',
    category: 'jobs',
    keywords: ['job', 'timer', 'schedule', 'details', 'get'],
    defer_loading: true,
  },
  {
    name: 'get_job_logs',
    description: 'Get execution logs for a scheduled job',
    category: 'jobs',
    keywords: ['job', 'timer', 'logs', 'output', 'journalctl'],
    defer_loading: true,
  },
  {
    name: 'create_job',
    description: 'Create a new scheduled job (Linux systemd only)',
    category: 'jobs',
    keywords: ['job', 'timer', 'schedule', 'create', 'new', 'systemd'],
    defer_loading: true,
  },
  {
    name: 'update_job',
    description: 'Update a scheduled job (Linux systemd only)',
    category: 'jobs',
    keywords: ['job', 'timer', 'schedule', 'update', 'edit', 'modify'],
    defer_loading: true,
  },
  {
    name: 'delete_job',
    description: 'Delete a scheduled job (Linux systemd user jobs only)',
    category: 'jobs',
    keywords: ['job', 'timer', 'schedule', 'delete', 'remove'],
    defer_loading: true,
  },
  {
    name: 'enable_job',
    description: 'Enable a scheduled job so it runs on schedule',
    category: 'jobs',
    keywords: ['job', 'timer', 'enable', 'start', 'activate'],
    defer_loading: true,
  },
  {
    name: 'disable_job',
    description: 'Disable a scheduled job so it stops running',
    category: 'jobs',
    keywords: ['job', 'timer', 'disable', 'stop', 'deactivate'],
    defer_loading: true,
  },
  {
    name: 'run_job_now',
    description: 'Trigger immediate execution of a scheduled job',
    category: 'jobs',
    keywords: ['job', 'timer', 'run', 'trigger', 'execute', 'now'],
    defer_loading: true,
  },

  // Board tools - agent coordination, always loaded
  {
    name: 'board_read',
    description: 'Read the agent coordination board for recent messages from other agents',
    category: 'board',
    keywords: ['board', 'coordination', 'agent', 'read', 'messages', 'status', 'conflict'],
    defer_loading: false,
  },
  {
    name: 'board_post',
    description: 'Post a message to the agent coordination board (claims, status, warnings)',
    category: 'board',
    keywords: ['board', 'coordination', 'agent', 'post', 'claim', 'resource', 'port', 'announce'],
    defer_loading: false,
  },
  {
    name: 'board_check',
    description: 'Check if a resource is claimed by another agent on the coordination board',
    category: 'board',
    keywords: ['board', 'coordination', 'agent', 'check', 'claim', 'resource', 'port', 'conflict'],
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
