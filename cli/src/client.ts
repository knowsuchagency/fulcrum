import { discoverServerUrl, getAuthCredentials } from './utils/server'
import { ApiError } from './utils/errors'
import type {
  Task,
  TaskStatus,
  GitBranchesResponse,
  GitDiffResponse,
  GitStatusResponse,
  WorktreesResponse,
  ConfigResponse,
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
  private authHeader: string | null

  constructor(urlOverride?: string, portOverride?: string) {
    this.baseUrl = discoverServerUrl(urlOverride, portOverride)

    const credentials = getAuthCredentials()
    if (credentials) {
      const encoded = btoa(`${credentials.username}:${credentials.password}`)
      this.authHeader = `Basic ${encoded}`
    } else {
      this.authHeader = null
    }
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    }

    if (this.authHeader) {
      headers['Authorization'] = this.authHeader
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      })

      if (res.status === 401) {
        throw new ApiError(
          401,
          'Authentication required. Configure basicAuthUsername and basicAuthPassword in settings.json'
        )
      }

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
}
