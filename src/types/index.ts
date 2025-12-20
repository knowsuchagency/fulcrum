export type TaskStatus =
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DONE'
  | 'CANCELLED'

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
