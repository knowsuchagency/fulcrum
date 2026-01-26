// Shared types between server, frontend, and CLI

// Supported AI coding agents
export type AgentType = 'claude' | 'opencode'

export const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
}

export const AGENT_INSTALL_COMMANDS: Record<AgentType, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  opencode: 'npm install -g opencode-ai@latest',
}

export const AGENT_DOC_URLS: Record<AgentType, string> = {
  claude: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  opencode: 'https://opencode.ai/docs/',
}

export type TaskStatus =
  | 'TO_DO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'CANCELED'

export interface DiffOptions {
  wrap: boolean
  ignoreWhitespace: boolean
  includeUntracked: boolean
  collapsedFiles: string[]
}

export interface FilesViewState {
  selectedFile: string | null
  expandedDirs: string[]
}

export interface ViewState {
  activeTab: 'diff' | 'browser' | 'files' | 'details'
  browserUrl: string
  diffOptions: DiffOptions
  filesViewState: FilesViewState
}

export interface FileTreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeEntry[]
}

export interface FileContent {
  content: string
  mimeType: string
  size: number
  lineCount: number
  truncated: boolean
  mtime: string
}

export interface FileStatResponse {
  path: string
  mtime: string
  size: number
  exists: boolean
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  position: number
  repoPath: string | null // Nullable for non-worktree tasks
  repoName: string | null // Nullable for non-worktree tasks
  baseBranch: string | null // Nullable for non-worktree tasks
  branch: string | null
  worktreePath: string | null
  viewState: ViewState | null
  prUrl: string | null
  startupScript: string | null
  agent: AgentType
  aiMode: 'default' | 'plan' | null
  agentOptions: Record<string, string> | null
  opencodeModel: string | null
  pinned: boolean
  // Generalized task management fields
  projectId: string | null // FK to project (null = orphan/inbox)
  repositoryId: string | null // FK to repository for worktree tasks
  tags: string[] // Array of tag strings
  startedAt: string | null // Timestamp when moved out of TO_DO
  dueDate: string | null // YYYY-MM-DD format
  notes: string | null // Free-form notes/comments
  createdAt: string
  updatedAt: string
  links?: TaskLink[]
}

// Tag - reusable tags shared between tasks and projects
export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: string
}

// Tag with usage count for search/suggestions
export interface TagWithUsage extends Tag {
  taskCount: number
  projectCount: number
}

// Link types for arbitrary URL associations (shared by tasks and projects)
export type LinkType = 'pr' | 'issue' | 'docs' | 'design' | 'other'

// Alias for backwards compatibility
export type TaskLinkType = LinkType

export interface TaskLink {
  id: string
  taskId: string
  url: string
  label: string | null
  type: LinkType | null
  createdAt: string
}

export interface ProjectLink {
  id: string
  projectId: string
  url: string
  label: string | null
  type: LinkType | null
  createdAt: string
}

// Task dependency for tracking blocked tasks
export interface TaskDependency {
  id: string
  taskId: string
  dependsOnTaskId: string
  createdAt: string
}

// Task attachment for file uploads
export interface TaskAttachment {
  id: string
  taskId: string
  filename: string
  storedPath: string
  mimeType: string
  size: number
  createdAt: string
}

// Project attachment for file uploads
export interface ProjectAttachment {
  id: string
  projectId: string
  filename: string
  storedPath: string
  mimeType: string
  size: number
  createdAt: string
}

// Project-Repository M:N relationship
export interface ProjectRepository {
  id: string
  projectId: string
  repositoryId: string
  isPrimary: boolean
  createdAt: string
}

export type TerminalLayout =
  | 'single'
  | 'split-h'
  | 'split-v'
  | 'triple'
  | 'quad'

export interface TerminalTab {
  id: string
  name: string
  layout: TerminalLayout
  position: number
  directory?: string
}

export interface Terminal {
  id: string
  tabId: string | null
  taskId: string | null
  name: string
  position: number
  cwd?: string
}

export interface Worktree {
  path: string
  name: string
  size: number
  sizeFormatted: string
  branch: string
  lastModified: string
  isOrphaned: boolean
  taskId?: string
  taskTitle?: string
  taskStatus?: TaskStatus
  repoPath?: string
  pinned?: boolean
}

// Basic worktree info (fast to compute - no du/git commands)
export interface WorktreeBasic {
  path: string
  name: string
  lastModified: string
  isOrphaned: boolean
  taskId?: string
  taskTitle?: string
  taskStatus?: TaskStatus
  repoPath?: string
  pinned?: boolean
}

// Extended worktree details (slow to compute - requires du/git)
export interface WorktreeDetails {
  path: string
  size: number
  sizeFormatted: string
  branch: string
}

export interface WorktreesSummary {
  total: number
  orphaned: number
  totalSize: number
  totalSizeFormatted: string
}

export interface Repository {
  id: string
  path: string
  displayName: string
  startupScript: string | null
  copyFiles: string | null
  claudeOptions: Record<string, string> | null
  opencodeOptions: Record<string, string> | null
  opencodeModel: string | null
  defaultAgent: AgentType | null
  remoteUrl: string | null
  isCopierTemplate: boolean
  createdAt: string
  updatedAt: string
}

// Repository with linked projects (returned from GET /api/repositories/:id)
export interface RepositoryWithProjects extends Repository {
  projects: { id: string; name: string }[]
}

// Copier template types
export type CopierQuestionType = 'str' | 'bool' | 'int' | 'float' | 'yaml' | 'json'

export interface CopierChoice {
  label: string
  value: string | number | boolean
}

export interface CopierQuestion {
  name: string
  type: CopierQuestionType
  default?: unknown
  help?: string
  choices?: CopierChoice[]
  multiselect?: boolean
}

export interface CopierQuestionsResponse {
  questions: CopierQuestion[]
  templatePath: string
}

export interface CreateProjectRequest {
  templateSource: string // Repo ID, local path, or git URL
  outputPath: string
  answers: Record<string, unknown>
  projectName: string
  trust?: boolean // Trust template for unsafe features (tasks, migrations)
  existingProjectId?: string // If provided, link repo to this project instead of creating a new one
}

export interface CreateProjectResponse {
  success: boolean
  projectPath: string
  repositoryId: string
  projectId: string
}

// Git API response types
export interface GitBranchesResponse {
  branches: string[]
  current: string
}

export interface GitFileStatus {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'untracked' | 'ignored' | 'unknown'
  staged: boolean
}

export interface GitDiffResponse {
  branch: string
  diff: string
  files: GitFileStatus[]
  hasStagedChanges: boolean
  hasUnstagedChanges: boolean
  isBranchDiff: boolean
  baseBranch?: string
}

export interface GitStatusResponse {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  clean: boolean
}

// Config API types
export interface ConfigResponse {
  key: string
  value: string | number | null
  isDefault?: boolean
}

// Notification types
export interface SoundNotificationConfig {
  enabled: boolean
  customSoundFile?: string // Path to user-uploaded sound file
}

export interface SlackNotificationConfig {
  enabled: boolean
  webhookUrl?: string
}

export interface DiscordNotificationConfig {
  enabled: boolean
  webhookUrl?: string
}

export interface PushoverNotificationConfig {
  enabled: boolean
  appToken?: string
  userKey?: string
}

export interface NotificationSettings {
  enabled: boolean
  sound: SoundNotificationConfig
  slack: SlackNotificationConfig
  discord: DiscordNotificationConfig
  pushover: PushoverNotificationConfig
}

export interface NotificationTestResult {
  channel: string
  success: boolean
  error?: string
}

// Command execution types
export interface ExecuteCommandRequest {
  command: string
  sessionId?: string  // Optional - creates new session if omitted
  cwd?: string        // Initial cwd for new sessions
  timeout?: number    // Timeout in ms (default 30000)
  name?: string       // Optional session name (only used when creating new session)
}

export interface ExecuteCommandResponse {
  sessionId: string
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export interface ExecSession {
  id: string
  name?: string
  cwd: string
  createdAt: string
  lastUsedAt: string
}

export interface UpdateExecSessionRequest {
  name?: string
}

// App deployment types
export type AppStatus = 'stopped' | 'building' | 'running' | 'failed'
export type DeploymentStatus = 'pending' | 'building' | 'running' | 'failed' | 'rolled_back'
export type DeployedBy = 'manual' | 'auto' | 'rollback'
export type ExposureMethod = 'dns' | 'tunnel'
export type TunnelStatus = 'inactive' | 'active' | 'failed'

export interface AppService {
  id: string
  appId: string
  serviceName: string
  containerPort: number | null
  exposed: boolean
  domain: string | null
  exposureMethod: ExposureMethod
  status: string | null
  containerId: string | null
  createdAt: string
  updatedAt: string
}

export interface Tunnel {
  id: string
  appId: string
  tunnelId: string
  tunnelName: string
  status: TunnelStatus
  createdAt: string
  updatedAt: string
}

export interface App {
  id: string
  name: string
  repositoryId: string
  branch: string
  composeFile: string
  status: AppStatus
  autoDeployEnabled: boolean
  autoPortAllocation?: boolean
  environmentVariables?: Record<string, string>
  noCacheBuild?: boolean
  notificationsEnabled?: boolean
  lastDeployedAt: string | null
  lastDeployCommit: string | null
  createdAt: string
  updatedAt: string
  services?: AppService[]
  repository?: {
    id: string
    path: string
    displayName: string
  }
}

export interface Deployment {
  id: string
  appId: string
  status: DeploymentStatus
  gitCommit: string | null
  gitMessage: string | null
  deployedBy: DeployedBy | null
  buildLogs: string | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface ComposePort {
  container: number
  host?: number
  protocol?: 'tcp' | 'udp'
}

export interface ComposeService {
  name: string
  build?: {
    context: string
    dockerfile?: string
  }
  image?: string
  ports?: ComposePort[]
  environment?: Record<string, string>
  depends_on?: string[]
}

export interface ParsedComposeFile {
  file: string
  services: ComposeService[]
}

export interface ContainerStatus {
  name: string
  service: string
  status: string
  health?: string
  ports: string[]
}

export interface DeploymentSettings {
  cloudflareApiToken: string | null
  cloudflareConfigured: boolean
}

// Scheduled jobs (systemd timers) types
export type JobScope = 'user' | 'system'
export type JobState = 'active' | 'inactive' | 'failed' | 'waiting'

export interface SystemdTimer {
  name: string
  scope: JobScope
  description: string | null
  state: JobState
  enabled: boolean
  nextRun: string | null
  lastRun: string | null
  lastResult: 'success' | 'failed' | 'unknown' | null
  schedule: string | null
  serviceName: string
  unitPath: string | null
}

export interface SystemdTimerDetail extends SystemdTimer {
  timerContent: string | null
  serviceContent: string | null
  command: string | null
  workingDirectory: string | null
  // Execution stats from last run
  lastRunStart: string | null
  lastRunEnd: string | null
  lastRunDurationMs: number | null
  lastRunCpuTimeMs: number | null
}

export interface CreateTimerRequest {
  name: string
  description: string
  schedule: string
  command: string
  workingDirectory?: string
  environment?: Record<string, string>
  persistent?: boolean
}

export interface UpdateTimerRequest {
  description?: string
  schedule?: string
  command?: string
  workingDirectory?: string
  environment?: Record<string, string>
  persistent?: boolean
}

export interface JobLogEntry {
  timestamp: string
  message: string
  priority: 'info' | 'warning' | 'error'
}

export interface JobLogsResponse {
  entries: JobLogEntry[]
}

export type JobPlatform = 'systemd' | 'launchd' | null

export interface JobsAvailableResponse {
  available: boolean
  canCreate: boolean
  platform: JobPlatform
}

// Project types - unified entity wrapping repository + app + terminal
export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  name: string
  description: string | null
  notes: string | null
  repositoryId: string | null
  appId: string | null
  terminalTabId: string | null
  status: ProjectStatus
  // Agent configuration - inherited by repositories unless overridden
  defaultAgent: AgentType | null
  claudeOptions: Record<string, string> | null
  opencodeOptions: Record<string, string> | null
  opencodeModel: string | null
  lastAccessedAt: string | null
  createdAt: string
  updatedAt: string
}

// Repository details for ProjectWithDetails
export interface ProjectRepositoryDetails {
  id: string
  path: string
  displayName: string
  startupScript: string | null
  copyFiles: string | null
  defaultAgent: AgentType | null
  claudeOptions: Record<string, string> | null
  opencodeOptions: Record<string, string> | null
  opencodeModel: string | null
  remoteUrl: string | null
  isCopierTemplate: boolean
  isPrimary: boolean // From project_repositories join
}

// Project with nested entities for API responses
export interface ProjectWithDetails extends Project {
  // DEPRECATED: Use repositories array instead
  repository: {
    id: string
    path: string
    displayName: string
    startupScript: string | null
    copyFiles: string | null
    defaultAgent: AgentType | null
    claudeOptions: Record<string, string> | null
    opencodeOptions: Record<string, string> | null
    opencodeModel: string | null
    remoteUrl: string | null
    isCopierTemplate: boolean
  } | null
  // New: Multiple repositories per project
  repositories: ProjectRepositoryDetails[]
  app: {
    id: string
    name: string
    branch: string
    composeFile: string
    status: AppStatus
    autoDeployEnabled: boolean
    autoPortAllocation: boolean
    noCacheBuild: boolean
    notificationsEnabled: boolean
    environmentVariables: Record<string, string> | null
    lastDeployedAt: string | null
    lastDeployCommit: string | null
    services: AppService[]
  } | null
  terminalTab: {
    id: string
    name: string
    directory: string | null
  } | null
  tags: Tag[] // Project tags
  attachments: ProjectAttachment[] // Project attachments
  links: ProjectLink[] // Project links
  taskCount: number // Number of tasks in this project
}

// Page context types for AI chat assistant
export type PageType =
  | 'tasks'
  | 'task'
  | 'projects'
  | 'project'
  | 'repositories'
  | 'repository'
  | 'monitoring'
  | 'terminals'
  | 'apps'
  | 'app'
  | 'jobs'
  | 'job'
  | 'settings'
  | 'unknown'

export interface PageContext {
  pageType: PageType
  path: string
  taskId?: string
  projectId?: string
  repositoryId?: string
  appId?: string
  jobId?: string
  filters?: {
    project?: string
    tags?: string[]
    view?: string
  }
  activeTab?: string
}

// Messaging channel types
export type MessagingChannelType = 'whatsapp' | 'discord' | 'telegram' | 'slack'
export type MessagingConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr_pending'

export interface MessagingConnection {
  id: string
  channelType: MessagingChannelType
  enabled: boolean
  displayName: string | null
  status: MessagingConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface MessagingSessionMapping {
  id: string
  connectionId: string
  channelUserId: string
  channelUserName: string | null
  sessionId: string
  createdAt: string
  lastMessageAt: string
}
