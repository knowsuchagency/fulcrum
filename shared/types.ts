// Shared types between server, frontend, and CLI

export type TaskStatus =
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
  activeTab: 'diff' | 'browser' | 'files'
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
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  position: number
  repoPath: string
  repoName: string
  baseBranch: string
  branch: string | null
  worktreePath: string | null
  viewState: ViewState | null
  prUrl: string | null
  linearTicketId: string | null
  linearTicketUrl: string | null
  startupScript: string | null
  createdAt: string
  updatedAt: string
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
  isCopierTemplate: boolean
  createdAt: string
  updatedAt: string
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
}

export interface CreateProjectResponse {
  success: boolean
  projectPath: string
  repositoryId: string
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
