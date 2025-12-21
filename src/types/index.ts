export type TaskStatus =
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'CANCELLED'

export interface DiffOptions {
  wrap: boolean
  ignoreWhitespace: boolean
  includeUntracked: boolean
}

export interface FilesViewState {
  selectedFile: string | null
  expandedDirs: string[]
}

export interface ViewState {
  activeTab: 'diff' | 'browser' | 'files'
  browserUrl: string
  diffOptions: DiffOptions
  filesViewState?: FilesViewState
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
  repoPath?: string
}

export interface WorktreesSummary {
  total: number
  orphaned: number
  totalSize: number
  totalSizeFormatted: string
}

export interface WorktreesResponse {
  worktrees: Worktree[]
  summary: WorktreesSummary
}
