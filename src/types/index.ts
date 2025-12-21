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

export interface ViewState {
  activeTab: 'diff' | 'browser'
  browserUrl: string
  diffOptions: DiffOptions
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
