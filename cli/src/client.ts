import { discoverServerUrl } from './utils/server'
import { ApiError } from './utils/errors'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type {
  Task,
  TaskStatus,
  TaskLink,
  TaskAttachment,
  ProjectAttachment,
  ProjectLink,
  Tag,
  Repository,
  ProjectWithDetails,
  App,
  Deployment,
  FileTreeEntry,
  FileContent,
  FileStatResponse,
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
  repoPath?: string | null
  repoName?: string | null
  baseBranch?: string | null
  branch?: string | null
  worktreePath?: string | null
  projectId?: string | null
  repositoryId?: string | null
  tags?: string[]
  dueDate?: string | null
}

export interface TaskTagsResponse {
  tags: string[]
}

export interface TaskDueDateResponse {
  dueDate: string | null
}

export interface TaskDependencyInfo {
  id: string
  task: { id: string; title: string; status: TaskStatus } | null
  createdAt: string
}

export interface TaskDependenciesResponse {
  dependsOn: (TaskDependencyInfo & { dependsOnTaskId: string })[]
  dependents: (TaskDependencyInfo & { taskId: string })[]
  isBlocked: boolean
}

export interface TaskDependency {
  id: string
  taskId: string
  dependsOnTaskId: string
  createdAt: string
}

export interface DiffQueryOptions {
  staged?: boolean
  ignoreWhitespace?: boolean
  includeUntracked?: boolean
}

// Project types
export interface CreateProjectInput {
  name: string
  description?: string
  // Option 1: Link to existing repository
  repositoryId?: string
  // Option 2: Create from local path
  path?: string
  // Option 3: Clone from URL
  url?: string
  targetDir?: string // For cloning
  folderName?: string // For cloning
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  notes?: string | null
  status?: 'active' | 'archived'
}

export interface DeleteProjectOptions {
  deleteDirectory?: boolean
  deleteApp?: boolean
}

// App types
export interface CreateAppInput {
  name: string
  repositoryId: string
  branch?: string
  composeFile?: string
  autoDeployEnabled?: boolean
  environmentVariables?: Record<string, string>
  noCacheBuild?: boolean
  services?: Array<{
    serviceName: string
    containerPort?: number
    exposed: boolean
    domain?: string
    exposureMethod?: 'dns' | 'tunnel'
  }>
}

export interface UpdateAppInput {
  name?: string
  branch?: string
  autoDeployEnabled?: boolean
  autoPortAllocation?: boolean
  environmentVariables?: Record<string, string>
  noCacheBuild?: boolean
  notificationsEnabled?: boolean
  services?: Array<{
    id?: string
    serviceName: string
    containerPort?: number
    exposed: boolean
    domain?: string
    exposureMethod?: 'dns' | 'tunnel'
  }>
}

export interface AppLogOptions {
  service?: string
  tail?: number
}

export interface AppStatus {
  containers: Array<{
    name: string
    service: string
    status: string
    replicas: string
    ports: string[]
  }>
}

// Filesystem types
export interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  isGitRepo: boolean
}

export interface ListDirectoryResponse {
  path: string
  parent: string
  entries: DirectoryEntry[]
}

export interface FileTreeResponse {
  root: string
  entries: FileTreeEntry[]
}

export interface WriteFileInput {
  path: string
  root: string
  content: string
}

export interface EditFileInput {
  path: string
  root: string
  old_string: string
  new_string: string
}

export interface PathStatResponse {
  path: string
  exists: boolean
  type: 'file' | 'directory' | 'other' | null
  isDirectory: boolean
  isFile: boolean
}

export class FulcrumClient {
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
  async listRepositories(options?: { orphans?: boolean; projectId?: string }): Promise<Repository[]> {
    const params = new URLSearchParams()
    if (options?.orphans) params.set('orphans', 'true')
    if (options?.projectId) params.set('projectId', options.projectId)
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.fetch(`/api/repositories${query}`)
  }

  async getRepository(id: string): Promise<Repository> {
    return this.fetch(`/api/repositories/${id}`)
  }

  async addRepository(path: string, displayName?: string): Promise<Repository> {
    return this.fetch('/api/repositories', {
      method: 'POST',
      body: JSON.stringify({ path, displayName }),
    })
  }

  async updateRepository(
    id: string,
    updates: {
      displayName?: string
      startupScript?: string | null
      copyFiles?: string | null
      defaultAgent?: 'claude' | 'opencode' | null
      claudeOptions?: Record<string, string> | null
      opencodeOptions?: Record<string, string> | null
      opencodeModel?: string | null
    }
  ): Promise<Repository> {
    return this.fetch(`/api/repositories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteRepository(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/repositories/${id}`, { method: 'DELETE' })
  }

  async linkRepositoryToProject(
    repositoryId: string,
    projectId: string,
    options?: { isPrimary?: boolean; force?: boolean }
  ): Promise<{ id: string; projectId: string; repositoryId: string; isPrimary: boolean }> {
    return this.fetch(`/api/projects/${projectId}/repositories`, {
      method: 'POST',
      body: JSON.stringify({
        repositoryId,
        isPrimary: options?.isPrimary,
        moveFromProject: options?.force,
      }),
    })
  }

  async unlinkRepositoryFromProject(
    repositoryId: string,
    projectId: string
  ): Promise<{ success: boolean }> {
    return this.fetch(`/api/projects/${projectId}/repositories/${repositoryId}`, {
      method: 'DELETE',
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
    // Fetch current settings first to get _updatedAt for optimistic locking
    const current = await this.getNotifications()
    return this.fetch('/api/config/notifications', {
      method: 'PUT',
      body: JSON.stringify({ ...updates, _updatedAt: current._updatedAt }),
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

  async restartFulcrum(): Promise<{ success?: boolean; message?: string; error?: string }> {
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

  // Task tags
  async addTaskTag(taskId: string, tag: string): Promise<TaskTagsResponse> {
    return this.fetch(`/api/tasks/${taskId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    })
  }

  async removeTaskTag(taskId: string, tag: string): Promise<TaskTagsResponse> {
    return this.fetch(`/api/tasks/${taskId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    })
  }

  // Task due date
  async setTaskDueDate(taskId: string, dueDate: string | null): Promise<TaskDueDateResponse> {
    return this.fetch(`/api/tasks/${taskId}/due-date`, {
      method: 'PATCH',
      body: JSON.stringify({ dueDate }),
    })
  }

  // Task dependencies
  async getTaskDependencies(taskId: string): Promise<TaskDependenciesResponse> {
    return this.fetch(`/api/tasks/${taskId}/dependencies`)
  }

  async addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<TaskDependency> {
    return this.fetch(`/api/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ dependsOnTaskId }),
    })
  }

  async removeTaskDependency(taskId: string, depId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/tasks/${taskId}/dependencies/${depId}`, {
      method: 'DELETE',
    })
  }

  // Task attachments
  async listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
    return this.fetch(`/api/tasks/${taskId}/attachments`)
  }

  async uploadTaskAttachment(taskId: string, filePath: string): Promise<TaskAttachment> {
    // Read file from local filesystem
    const fileContent = readFileSync(filePath)
    const filename = basename(filePath)

    // Create form data with blob
    const formData = new FormData()
    const blob = new Blob([fileContent])
    formData.append('file', blob, filename)

    // Make request without Content-Type header (let browser set it with boundary)
    const url = `${this.baseUrl}/api/tasks/${taskId}/attachments`
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body.error || body.message || `Request failed: ${res.status}`)
    }

    return res.json()
  }

  async deleteTaskAttachment(taskId: string, attachmentId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
  }

  async getTaskAttachmentPath(taskId: string, attachmentId: string): Promise<{ path: string; filename: string; mimeType: string }> {
    // Get all attachments and find the one we need
    const attachments = await this.listTaskAttachments(taskId)
    const attachment = attachments.find((a) => a.id === attachmentId)
    if (!attachment) {
      throw new ApiError(404, `Attachment not found: ${attachmentId}`)
    }
    return { path: attachment.storedPath, filename: attachment.filename, mimeType: attachment.mimeType }
  }

  // Task dependency graph
  async getTaskDependencyGraph(): Promise<{
    nodes: Array<{ id: string; title: string; status: TaskStatus; projectId: string | null; tags: string[]; dueDate: string | null }>
    edges: Array<{ id: string; source: string; target: string }>
  }> {
    return this.fetch('/api/task-dependencies/graph')
  }

  // Projects
  async listProjects(): Promise<ProjectWithDetails[]> {
    return this.fetch('/api/projects')
  }

  async getProject(id: string): Promise<ProjectWithDetails> {
    return this.fetch(`/api/projects/${id}`)
  }

  async createProject(data: CreateProjectInput): Promise<ProjectWithDetails> {
    return this.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateProject(id: string, updates: UpdateProjectInput): Promise<ProjectWithDetails> {
    return this.fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteProject(
    id: string,
    options?: DeleteProjectOptions
  ): Promise<{ success: true; deletedDirectory: boolean; deletedApp: boolean }> {
    const params = new URLSearchParams()
    if (options?.deleteDirectory) params.set('deleteDirectory', 'true')
    if (options?.deleteApp) params.set('deleteApp', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.fetch(`/api/projects/${id}${query}`, { method: 'DELETE' })
  }

  async scanProjects(
    directory?: string
  ): Promise<{
    directory: string
    repositories: Array<{
      path: string
      name: string
      hasRepository: boolean
      hasProject: boolean
    }>
  }> {
    return this.fetch('/api/projects/scan', {
      method: 'POST',
      body: JSON.stringify({ directory }),
    })
  }

  async bulkCreateProjects(
    repositories: Array<{ path: string; displayName?: string }>
  ): Promise<{ created: ProjectWithDetails[]; skipped: number }> {
    return this.fetch('/api/projects/bulk', {
      method: 'POST',
      body: JSON.stringify({ repositories }),
    })
  }

  // Project tags
  async addProjectTag(projectId: string, tagIdOrName: string): Promise<Tag> {
    // Check if it looks like an ID (nanoid format) or a name
    const isId = tagIdOrName.length === 21 && /^[a-zA-Z0-9_-]+$/.test(tagIdOrName)
    return this.fetch(`/api/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify(isId ? { tagId: tagIdOrName } : { name: tagIdOrName }),
    })
  }

  async removeProjectTag(projectId: string, tagId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/projects/${projectId}/tags/${tagId}`, {
      method: 'DELETE',
    })
  }

  // Project attachments
  async listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
    return this.fetch(`/api/projects/${projectId}/attachments`)
  }

  async uploadProjectAttachment(projectId: string, filePath: string): Promise<ProjectAttachment> {
    const fileContent = readFileSync(filePath)
    const filename = basename(filePath)

    const formData = new FormData()
    const blob = new Blob([fileContent])
    formData.append('file', blob, filename)

    const url = `${this.baseUrl}/api/projects/${projectId}/attachments`
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body.error || body.message || `Request failed: ${res.status}`)
    }

    return res.json()
  }

  async deleteProjectAttachment(projectId: string, attachmentId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/projects/${projectId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
  }

  async getProjectAttachmentPath(projectId: string, attachmentId: string): Promise<{ path: string; filename: string; mimeType: string }> {
    const attachments = await this.listProjectAttachments(projectId)
    const attachment = attachments.find((a) => a.id === attachmentId)
    if (!attachment) {
      throw new ApiError(404, `Attachment not found: ${attachmentId}`)
    }
    return { path: attachment.storedPath, filename: attachment.filename, mimeType: attachment.mimeType }
  }

  // Project links
  async listProjectLinks(projectId: string): Promise<ProjectLink[]> {
    return this.fetch(`/api/projects/${projectId}/links`)
  }

  async addProjectLink(projectId: string, url: string, label?: string): Promise<ProjectLink> {
    return this.fetch(`/api/projects/${projectId}/links`, {
      method: 'POST',
      body: JSON.stringify({ url, label }),
    })
  }

  async removeProjectLink(projectId: string, linkId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/projects/${projectId}/links/${linkId}`, {
      method: 'DELETE',
    })
  }

  // Apps
  async listApps(): Promise<App[]> {
    return this.fetch('/api/apps')
  }

  async getApp(id: string): Promise<App> {
    return this.fetch(`/api/apps/${id}`)
  }

  async createApp(data: CreateAppInput): Promise<App> {
    return this.fetch('/api/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateApp(id: string, updates: UpdateAppInput): Promise<App> {
    return this.fetch(`/api/apps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteApp(
    id: string,
    stopContainers: boolean = true
  ): Promise<{ success: true }> {
    const query = stopContainers ? '' : '?stopContainers=false'
    return this.fetch(`/api/apps/${id}${query}`, { method: 'DELETE' })
  }

  async deployApp(id: string): Promise<{ success: boolean; deployment?: Deployment; error?: string }> {
    return this.fetch(`/api/apps/${id}/deploy`, { method: 'POST' })
  }

  async stopApp(id: string): Promise<{ success: boolean; error?: string }> {
    return this.fetch(`/api/apps/${id}/stop`, { method: 'POST' })
  }

  async getAppLogs(id: string, options?: AppLogOptions): Promise<{ logs: string }> {
    const params = new URLSearchParams()
    if (options?.service) params.set('service', options.service)
    if (options?.tail) params.set('tail', String(options.tail))
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.fetch(`/api/apps/${id}/logs${query}`)
  }

  async getAppStatus(id: string): Promise<AppStatus> {
    return this.fetch(`/api/apps/${id}/status`)
  }

  async listDeployments(appId: string): Promise<Deployment[]> {
    return this.fetch(`/api/apps/${appId}/deployments`)
  }

  async syncAppServices(id: string): Promise<{
    success: boolean
    services: Array<{
      serviceName: string
      containerPort: number | null
      exposed: boolean
      domain: string | null
    }>
  }> {
    return this.fetch(`/api/apps/${id}/sync-services`, { method: 'POST' })
  }

  // Filesystem
  async listDirectory(path?: string): Promise<ListDirectoryResponse> {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    return this.fetch(`/api/fs/list${query}`)
  }

  async getFileTree(root: string): Promise<FileTreeResponse> {
    return this.fetch(`/api/fs/tree?root=${encodeURIComponent(root)}`)
  }

  async readFile(
    path: string,
    root: string,
    maxLines?: number
  ): Promise<FileContent> {
    const params = new URLSearchParams({ path, root })
    if (maxLines) params.set('maxLines', String(maxLines))
    return this.fetch(`/api/fs/read?${params.toString()}`)
  }

  async writeFile(input: WriteFileInput): Promise<{ success: true; size: number; mtime: string }> {
    return this.fetch('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async editFile(input: EditFileInput): Promise<{ success: true; size: number; mtime: string }> {
    return this.fetch('/api/fs/edit', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async getFileStat(path: string, root: string): Promise<FileStatResponse> {
    const params = new URLSearchParams({ path, root })
    return this.fetch(`/api/fs/file-stat?${params.toString()}`)
  }

  async getPathStat(path: string): Promise<PathStatResponse> {
    return this.fetch(`/api/fs/stat?path=${encodeURIComponent(path)}`)
  }

  async isGitRepo(path: string): Promise<{ path: string; isGitRepo: boolean }> {
    return this.fetch(`/api/fs/is-git-repo?path=${encodeURIComponent(path)}`)
  }
}
