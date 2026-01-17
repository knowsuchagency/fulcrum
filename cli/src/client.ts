import { discoverServerUrl } from './utils/server'
import { ApiError } from './utils/errors'
import type {
  Task,
  TaskStatus,
  TaskLink,
  Repository,
  GitBranchesResponse,
  GitDiffResponse,
  GitStatusResponse,
  WorktreesResponse,
  ConfigResponse,
  NotificationSettings,
  NotificationTestResult,
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  ExecSession,
} from '@shared/types'

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
  repoPath: string
  repoName: string
  baseBranch: string
  branch?: string | null
  worktreePath?: string | null
}

export interface DiffQueryOptions {
  staged?: boolean
  ignoreWhitespace?: boolean
  includeUntracked?: boolean
}

export class ViboraClient {
  private baseUrl: string

  constructor(urlOverride?: string, portOverride?: string) {
    this.baseUrl = discoverServerUrl(urlOverride, portOverride)
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new ApiError(res.status, body.error || body.message || `Request failed: ${res.status}`)
      }

      return res.json()
    } catch (err) {
      if (err instanceof ApiError) throw err
      throw new ApiError(0, `Server unreachable: ${this.baseUrl}`)
    }
  }

  // Health
  async health(): Promise<{ status: string }> {
    return this.fetch('/health')
  }

  // Tasks
  async listTasks(): Promise<Task[]> {
    return this.fetch('/api/tasks')
  }

  async getTask(id: string): Promise<Task> {
    return this.fetch(`/api/tasks/${id}`)
  }

  async createTask(data: CreateTaskInput): Promise<Task> {
    return this.fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    return this.fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async moveTask(id: string, status: TaskStatus, position?: number): Promise<Task> {
    // If position not provided, get current tasks in target column to calculate
    if (position === undefined) {
      const tasks = await this.listTasks()
      const targetTasks = tasks.filter((t) => t.status === status)
      position = targetTasks.length
    }

    return this.fetch(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, position }),
    })
  }

  async deleteTask(
    id: string,
    deleteLinkedWorktree?: boolean
  ): Promise<{ success: true }> {
    const url = deleteLinkedWorktree
      ? `/api/tasks/${id}?deleteLinkedWorktree=true`
      : `/api/tasks/${id}`
    return this.fetch(url, { method: 'DELETE' })
  }

  async bulkDeleteTasks(
    ids: string[],
    deleteLinkedWorktrees?: boolean
  ): Promise<{ success: true; deleted: number }> {
    return this.fetch('/api/tasks/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ ids, deleteLinkedWorktrees }),
    })
  }

  // Repositories
  async listRepositories(): Promise<Repository[]> {
    return this.fetch('/api/repositories')
  }

  // Git
  async getBranches(repo: string): Promise<GitBranchesResponse> {
    return this.fetch(`/api/git/branches?repo=${encodeURIComponent(repo)}`)
  }

  async getDiff(path: string, options?: DiffQueryOptions): Promise<GitDiffResponse> {
    const params = new URLSearchParams({ path })
    if (options?.staged) params.set('staged', 'true')
    if (options?.ignoreWhitespace) params.set('ignoreWhitespace', 'true')
    if (options?.includeUntracked) params.set('includeUntracked', 'true')
    return this.fetch(`/api/git/diff?${params}`)
  }

  async getStatus(path: string): Promise<GitStatusResponse> {
    return this.fetch(`/api/git/status?path=${encodeURIComponent(path)}`)
  }

  // Worktrees
  async listWorktrees(): Promise<WorktreesResponse> {
    return this.fetch('/api/worktrees')
  }

  async deleteWorktree(
    worktreePath: string,
    repoPath?: string,
    deleteLinkedTask?: boolean
  ): Promise<{ success: true; path: string; deletedTaskId?: string }> {
    return this.fetch('/api/worktrees', {
      method: 'DELETE',
      body: JSON.stringify({ worktreePath, repoPath, deleteLinkedTask }),
    })
  }

  // Config
  async getAllConfig(): Promise<Record<string, unknown>> {
    return this.fetch('/api/config')
  }

  async getConfig(key: string): Promise<ConfigResponse> {
    return this.fetch(`/api/config/${key}`)
  }

  async setConfig(key: string, value: string | number): Promise<ConfigResponse> {
    return this.fetch(`/api/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  }

  async resetConfig(key: string): Promise<ConfigResponse> {
    return this.fetch(`/api/config/${key}`, { method: 'DELETE' })
  }

  // Notifications
  async getNotifications(): Promise<NotificationSettings> {
    return this.fetch('/api/config/notifications')
  }

  async updateNotifications(updates: Partial<NotificationSettings>): Promise<NotificationSettings> {
    return this.fetch('/api/config/notifications', {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async testNotification(
    channel: 'sound' | 'slack' | 'discord' | 'pushover'
  ): Promise<NotificationTestResult> {
    return this.fetch(`/api/config/notifications/test/${channel}`, {
      method: 'POST',
    })
  }

  async sendNotification(
    title: string,
    message: string
  ): Promise<{ success: boolean; results: NotificationTestResult[] }> {
    return this.fetch('/api/config/notifications/send', {
      method: 'POST',
      body: JSON.stringify({ title, message }),
    })
  }

  // Developer mode
  async getDeveloperMode(): Promise<{ enabled: boolean }> {
    return this.fetch('/api/config/developer-mode')
  }

  async restartVibora(): Promise<{ success?: boolean; message?: string; error?: string }> {
    return this.fetch('/api/config/restart', {
      method: 'POST',
    })
  }

  // Command execution
  async executeCommand(
    command: string,
    options?: { sessionId?: string; cwd?: string; timeout?: number; name?: string }
  ): Promise<ExecuteCommandResponse> {
    const body: ExecuteCommandRequest = {
      command,
      ...options,
    }
    return this.fetch('/api/exec', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async listExecSessions(): Promise<ExecSession[]> {
    return this.fetch('/api/exec/sessions')
  }

  async updateExecSession(sessionId: string, updates: { name?: string }): Promise<ExecSession> {
    return this.fetch(`/api/exec/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async destroyExecSession(sessionId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/exec/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  }

  // Task links
  async addTaskLink(taskId: string, url: string, label?: string): Promise<TaskLink> {
    return this.fetch(`/api/tasks/${taskId}/links`, {
      method: 'POST',
      body: JSON.stringify({ url, label }),
    })
  }

  async removeTaskLink(taskId: string, linkId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/tasks/${taskId}/links/${linkId}`, {
      method: 'DELETE',
    })
  }

  async listTaskLinks(taskId: string): Promise<TaskLink[]> {
    return this.fetch(`/api/tasks/${taskId}/links`)
  }
}
