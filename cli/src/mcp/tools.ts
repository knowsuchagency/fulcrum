import { basename } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViboraClient } from '../client'
import { formatSuccess, handleToolError } from './utils'
import { searchTools, toolRegistry } from './registry'

const TaskStatusSchema = z.enum(['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'])
const ProjectStatusSchema = z.enum(['active', 'archived'])
const AppStatusSchema = z.enum(['stopped', 'building', 'running', 'failed'])
const ToolCategorySchema = z.enum(['core', 'tasks', 'projects', 'apps', 'filesystem', 'git', 'notifications', 'exec'])

export function registerTools(server: McpServer, client: ViboraClient) {
  // ==========================================================================
  // Meta Tools
  // ==========================================================================

  // search_tools - Meta tool for discovering available tools
  server.tool(
    'search_tools',
    'Search for available Vibora MCP tools by keyword or category. Use this to discover tools for projects, apps, files, tasks, and more.',
    {
      query: z.optional(z.string()).describe('Search query to match against tool names, descriptions, and keywords'),
      category: z.optional(ToolCategorySchema).describe('Filter by tool category'),
    },
    async ({ query, category }) => {
      try {
        let results = query ? searchTools(query) : toolRegistry

        if (category) {
          results = results.filter((tool) => tool.category === category)
        }

        // Format results for easy consumption
        const formatted = results.map((tool) => ({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          keywords: tool.keywords,
        }))

        return formatSuccess({
          count: formatted.length,
          tools: formatted,
          hint: query
            ? `Found ${formatted.length} tools matching "${query}"`
            : `Listing ${formatted.length} tools${category ? ` in category "${category}"` : ''}`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // ==========================================================================
  // Task Tools
  // ==========================================================================

  // list_tasks
  server.tool(
    'list_tasks',
    'List all Vibora tasks with flexible filtering. Supports text search across title/labels/project, multi-label filtering (OR logic), multi-status filtering, date range, and overdue detection.',
    {
      status: z.optional(TaskStatusSchema).describe('Filter by single task status (use statuses for multiple)'),
      statuses: z.optional(z.array(TaskStatusSchema)).describe('Filter by multiple statuses (OR logic)'),
      repo: z.optional(z.string()).describe('Filter by repository name or path'),
      projectId: z.optional(z.string()).describe('Filter by project ID'),
      orphans: z.optional(z.boolean()).describe('Only show orphan tasks (not in any project)'),
      label: z.optional(z.string()).describe('Filter by single label (use labels for multiple)'),
      labels: z.optional(z.array(z.string())).describe('Filter by multiple labels (OR logic, case-insensitive)'),
      search: z.optional(z.string()).describe('Case-insensitive substring search across title, labels, and project name'),
      dueDateStart: z.optional(z.string()).describe('Start of date range (YYYY-MM-DD, inclusive)'),
      dueDateEnd: z.optional(z.string()).describe('End of date range (YYYY-MM-DD, inclusive)'),
      overdue: z.optional(z.boolean()).describe('Only show overdue tasks (due date in past, not DONE/CANCELED)'),
    },
    async ({ status, statuses, repo, projectId, orphans, label, labels, search, dueDateStart, dueDateEnd, overdue }) => {
      try {
        let tasks = await client.listTasks()

        // Build project name lookup for search functionality
        let projectsMap: Map<string, string> | undefined
        if (search) {
          const projects = await client.listProjects()
          projectsMap = new Map()
          for (const p of projects) {
            projectsMap.set(p.id, p.name)
          }
        }

        // Text search filter (case-insensitive substring)
        if (search) {
          const searchLower = search.toLowerCase()
          tasks = tasks.filter((t) => {
            // Check title
            if (t.title.toLowerCase().includes(searchLower)) return true
            // Check labels
            if (t.labels && t.labels.some((l) => l.toLowerCase().includes(searchLower))) return true
            // Check project name
            if (t.projectId && projectsMap) {
              const projectName = projectsMap.get(t.projectId)
              if (projectName?.toLowerCase().includes(searchLower)) return true
            }
            return false
          })
        }

        // Single status filter (legacy)
        if (status) {
          tasks = tasks.filter((t) => t.status === status)
        }

        // Multi-status filter (OR logic)
        if (statuses && statuses.length > 0) {
          tasks = tasks.filter((t) => statuses.includes(t.status))
        }

        if (repo) {
          const repoLower = repo.toLowerCase()
          tasks = tasks.filter(
            (t) =>
              (t.repoName && t.repoName.toLowerCase().includes(repoLower)) ||
              (t.repoPath && t.repoPath.toLowerCase().includes(repoLower))
          )
        }
        if (projectId) {
          tasks = tasks.filter((t) => t.projectId === projectId)
        }
        if (orphans) {
          tasks = tasks.filter((t) => t.projectId === null)
        }

        // Single label filter (legacy)
        if (label) {
          const labelLower = label.toLowerCase()
          tasks = tasks.filter((t) => t.labels && t.labels.some((l) => l.toLowerCase() === labelLower))
        }

        // Multi-label filter (OR logic)
        if (labels && labels.length > 0) {
          const labelsLower = labels.map((l) => l.toLowerCase())
          tasks = tasks.filter((t) => t.labels && t.labels.some((l) => labelsLower.includes(l.toLowerCase())))
        }

        // Date range filters
        if (dueDateStart) {
          tasks = tasks.filter((t) => t.dueDate && t.dueDate >= dueDateStart)
        }
        if (dueDateEnd) {
          tasks = tasks.filter((t) => t.dueDate && t.dueDate <= dueDateEnd)
        }

        // Overdue filter
        if (overdue) {
          const today = new Date().toISOString().split('T')[0]
          tasks = tasks.filter(
            (t) => t.dueDate && t.dueDate < today && t.status !== 'DONE' && t.status !== 'CANCELED'
          )
        }

        return formatSuccess(tasks)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_task
  server.tool(
    'get_task',
    'Get details of a specific task by ID',
    {
      id: z.string().describe('Task ID (UUID)'),
    },
    async ({ id }) => {
      try {
        const task = await client.getTask(id)
        return formatSuccess(task)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_task
  server.tool(
    'create_task',
    'Create a new task. For code tasks, provide repoPath to create a git worktree. For non-code tasks, omit repoPath. When labels are provided, returns all existing labels for reference.',
    {
      title: z.string().describe('Task title'),
      repoPath: z.optional(z.string()).describe('Absolute path to the git repository (optional for non-code tasks)'),
      baseBranch: z.string().default('main').describe('Base branch for the worktree'),
      branch: z.optional(z.string()).describe('Branch name for the task worktree (auto-generated if omitted)'),
      description: z.optional(z.string()).describe('Task description'),
      status: z.optional(TaskStatusSchema).describe('Initial status (default: IN_PROGRESS, use TO_DO for deferred worktree creation)'),
      projectId: z.optional(z.string()).describe('Project ID to associate with'),
      repositoryId: z.optional(z.string()).describe('Repository ID (alternative to repoPath)'),
      labels: z.optional(z.array(z.string())).describe('Labels to add to the task'),
      dueDate: z.optional(z.string()).describe('Due date in YYYY-MM-DD format'),
    },
    async ({ title, repoPath, baseBranch, branch, description, status, projectId, repositoryId, labels, dueDate }) => {
      try {
        const repoName = repoPath ? basename(repoPath) : null
        const task = await client.createTask({
          title,
          repoPath: repoPath ?? null,
          repoName,
          baseBranch: repoPath ? baseBranch : null,
          branch: branch ?? null,
          worktreePath: null,
          description,
          status: status ?? 'IN_PROGRESS',
          projectId: projectId ?? null,
          repositoryId: repositoryId ?? null,
          labels,
          dueDate: dueDate ?? null,
        })

        // If labels were provided, return all existing labels for agent reference
        if (labels && labels.length > 0) {
          const allTasks = await client.listTasks()
          const existingLabels = new Set<string>()
          for (const t of allTasks) {
            if (t.labels) {
              for (const l of t.labels) {
                existingLabels.add(l)
              }
            }
          }
          return formatSuccess({
            task,
            existingLabels: Array.from(existingLabels).sort(),
          })
        }

        return formatSuccess(task)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_task
  server.tool(
    'update_task',
    'Update task metadata (title or description)',
    {
      id: z.string().describe('Task ID'),
      title: z.optional(z.string()).describe('New title'),
      description: z.optional(z.string()).describe('New description'),
    },
    async ({ id, title, description }) => {
      try {
        const updates: Record<string, string> = {}
        if (title !== undefined) updates.title = title
        if (description !== undefined) updates.description = description

        const task = await client.updateTask(id, updates)
        return formatSuccess(task)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_task
  server.tool(
    'delete_task',
    'Delete a task and optionally its linked git worktree',
    {
      id: z.string().describe('Task ID'),
      deleteWorktree: z.boolean().default(false).describe('Also delete the linked git worktree'),
    },
    async ({ id, deleteWorktree }) => {
      try {
        await client.deleteTask(id, deleteWorktree)
        return formatSuccess({ deleted: id, worktreeDeleted: deleteWorktree })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // move_task
  server.tool(
    'move_task',
    'Move a task to a different status column',
    {
      id: z.string().describe('Task ID'),
      status: TaskStatusSchema.describe('Target status'),
      position: z.optional(z.number()).describe('Position in the column (0-indexed, defaults to end)'),
    },
    async ({ id, status, position }) => {
      try {
        const task = await client.moveTask(id, status, position)
        return formatSuccess(task)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_repositories
  server.tool(
    'list_repositories',
    'List all configured repositories (useful for task creation)',
    {},
    async () => {
      try {
        const repos = await client.listRepositories()
        return formatSuccess(repos)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // send_notification
  server.tool(
    'send_notification',
    'Send a notification to all enabled notification channels',
    {
      title: z.string().describe('Notification title'),
      message: z.string().describe('Notification message body'),
    },
    async ({ title, message }) => {
      try {
        const result = await client.sendNotification(title, message)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // execute_command
  server.tool(
    'execute_command',
    'Execute a CLI command on the remote Vibora server. Supports persistent sessions for stateful workflows where environment variables, working directory, and shell state are preserved between commands.',
    {
      command: z.string().describe('The shell command to execute'),
      sessionId: z
        .optional(z.string())
        .describe('Session ID for stateful workflows. Omit to create a new session. Reuse to maintain shell state.'),
      cwd: z
        .optional(z.string())
        .describe('Initial working directory (only used when creating a new session)'),
      timeout: z
        .optional(z.number())
        .describe('Timeout in milliseconds (default: 30000). Use longer timeouts for slow commands.'),
      name: z
        .optional(z.string())
        .describe('Optional session name for identification (only used when creating a new session)'),
    },
    async ({ command, sessionId, cwd, timeout, name }) => {
      try {
        const result = await client.executeCommand(command, { sessionId, cwd, timeout, name })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_exec_sessions
  server.tool(
    'list_exec_sessions',
    'List all active command execution sessions on the Vibora server',
    {},
    async () => {
      try {
        const sessions = await client.listExecSessions()
        return formatSuccess(sessions)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_exec_session
  server.tool(
    'update_exec_session',
    'Update an existing command execution session (e.g., rename it)',
    {
      sessionId: z.string().describe('The session ID to update'),
      name: z.optional(z.string()).describe('New name for the session'),
    },
    async ({ sessionId, name }) => {
      try {
        const result = await client.updateExecSession(sessionId, { name })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // destroy_exec_session
  server.tool(
    'destroy_exec_session',
    'Destroy an active command execution session to free resources',
    {
      sessionId: z.string().describe('The session ID to destroy'),
    },
    async ({ sessionId }) => {
      try {
        const result = await client.destroyExecSession(sessionId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_task_link
  server.tool(
    'add_task_link',
    'Add a URL link to a task (for documentation, related PRs, design files, etc.)',
    {
      taskId: z.string().describe('Task ID'),
      url: z.string().url().describe('URL to add'),
      label: z.optional(z.string()).describe('Display label (auto-detected if not provided)'),
    },
    async ({ taskId, url, label }) => {
      try {
        const link = await client.addTaskLink(taskId, url, label)
        return formatSuccess(link)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // remove_task_link
  server.tool(
    'remove_task_link',
    'Remove a URL link from a task',
    {
      taskId: z.string().describe('Task ID'),
      linkId: z.string().describe('Link ID to remove'),
    },
    async ({ taskId, linkId }) => {
      try {
        await client.removeTaskLink(taskId, linkId)
        return formatSuccess({ removed: linkId })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_task_links
  server.tool(
    'list_task_links',
    'List all URL links attached to a task',
    {
      taskId: z.string().describe('Task ID'),
    },
    async ({ taskId }) => {
      try {
        const links = await client.listTaskLinks(taskId)
        return formatSuccess(links)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_task_label
  server.tool(
    'add_task_label',
    'Add a label to a task for categorization. Returns similar existing labels to help catch typos.',
    {
      taskId: z.string().describe('Task ID'),
      label: z.string().describe('Label to add'),
    },
    async ({ taskId, label }) => {
      try {
        const result = await client.addTaskLabel(taskId, label)

        // Find similar existing labels to help catch typos
        const allTasks = await client.listTasks()
        const existingLabels = new Set<string>()
        for (const t of allTasks) {
          if (t.labels) {
            for (const l of t.labels) {
              existingLabels.add(l)
            }
          }
        }

        // Find similar labels (case-insensitive substring match)
        const labelLower = label.toLowerCase()
        const similarLabels = Array.from(existingLabels).filter(
          (l) =>
            l !== label &&
            (l.toLowerCase().includes(labelLower) || labelLower.includes(l.toLowerCase()))
        )

        return formatSuccess({
          ...result,
          similarLabels: similarLabels.length > 0 ? similarLabels : undefined,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // remove_task_label
  server.tool(
    'remove_task_label',
    'Remove a label from a task',
    {
      taskId: z.string().describe('Task ID'),
      label: z.string().describe('Label to remove'),
    },
    async ({ taskId, label }) => {
      try {
        const result = await client.removeTaskLabel(taskId, label)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // set_task_due_date
  server.tool(
    'set_task_due_date',
    'Set or clear the due date for a task',
    {
      taskId: z.string().describe('Task ID'),
      dueDate: z.nullable(z.string()).describe('Due date in YYYY-MM-DD format, or null to clear'),
    },
    async ({ taskId, dueDate }) => {
      try {
        const result = await client.setTaskDueDate(taskId, dueDate)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_task_dependencies
  server.tool(
    'get_task_dependencies',
    'Get the dependencies and dependents of a task, and whether it is blocked',
    {
      taskId: z.string().describe('Task ID'),
    },
    async ({ taskId }) => {
      try {
        const result = await client.getTaskDependencies(taskId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_task_dependency
  server.tool(
    'add_task_dependency',
    'Add a dependency between tasks (the task cannot start until the dependency is done)',
    {
      taskId: z.string().describe('Task ID that will depend on another task'),
      dependsOnTaskId: z.string().describe('Task ID that must be completed first'),
    },
    async ({ taskId, dependsOnTaskId }) => {
      try {
        const result = await client.addTaskDependency(taskId, dependsOnTaskId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // remove_task_dependency
  server.tool(
    'remove_task_dependency',
    'Remove a dependency from a task',
    {
      taskId: z.string().describe('Task ID'),
      dependencyId: z.string().describe('Dependency ID to remove'),
    },
    async ({ taskId, dependencyId }) => {
      try {
        const result = await client.removeTaskDependency(taskId, dependencyId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_task_dependency_graph
  server.tool(
    'get_task_dependency_graph',
    'Get all tasks and their dependencies as a graph structure for visualization',
    {},
    async () => {
      try {
        const result = await client.getTaskDependencyGraph()
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_tasks_by_label
  server.tool(
    'list_tasks_by_label',
    'List all tasks that have a specific label',
    {
      label: z.string().describe('Label to filter by'),
    },
    async ({ label }) => {
      try {
        let tasks = await client.listTasks()
        const labelLower = label.toLowerCase()
        tasks = tasks.filter((t) => t.labels && t.labels.some((l) => l.toLowerCase() === labelLower))
        return formatSuccess(tasks)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_labels
  server.tool(
    'list_labels',
    'List all unique labels in use across tasks. Use search to find labels by partial match (helps discover exact label names and handle typos/variations).',
    {
      search: z.optional(z.string()).describe('Find labels matching this substring (case-insensitive)'),
    },
    async ({ search }) => {
      try {
        const tasks = await client.listTasks()
        const labelCounts = new Map<string, number>()

        for (const task of tasks) {
          if (task.labels) {
            for (const label of task.labels) {
              labelCounts.set(label, (labelCounts.get(label) || 0) + 1)
            }
          }
        }

        let labels = Array.from(labelCounts.entries()).map(([name, count]) => ({
          name,
          count,
        }))

        if (search) {
          const searchLower = search.toLowerCase()
          labels = labels.filter((l) => l.name.toLowerCase().includes(searchLower))
        }

        // Sort by count descending
        labels.sort((a, b) => b.count - a.count)

        return formatSuccess({ labels })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_tasks_by_due_date
  server.tool(
    'list_tasks_by_due_date',
    'List tasks within a date range based on due date',
    {
      startDate: z.optional(z.string()).describe('Start date (YYYY-MM-DD), inclusive'),
      endDate: z.optional(z.string()).describe('End date (YYYY-MM-DD), inclusive'),
      overdue: z.optional(z.boolean()).describe('Only show overdue tasks'),
    },
    async ({ startDate, endDate, overdue }) => {
      try {
        let tasks = await client.listTasks()
        const today = new Date().toISOString().split('T')[0]

        if (overdue) {
          tasks = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'DONE' && t.status !== 'CANCELED')
        } else {
          if (startDate) {
            tasks = tasks.filter((t) => t.dueDate && t.dueDate >= startDate)
          }
          if (endDate) {
            tasks = tasks.filter((t) => t.dueDate && t.dueDate <= endDate)
          }
        }

        return formatSuccess(tasks)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // ==========================================================================
  // Project Tools
  // ==========================================================================

  // list_projects
  server.tool(
    'list_projects',
    'List all Vibora projects with optional filtering by status',
    {
      status: z.optional(ProjectStatusSchema).describe('Filter by status (active or archived)'),
    },
    async ({ status }) => {
      try {
        let projects = await client.listProjects()
        if (status) {
          projects = projects.filter((p) => p.status === status)
        }
        return formatSuccess(projects)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_project
  server.tool(
    'get_project',
    'Get details of a specific project by ID, including repository and app information',
    {
      id: z.string().describe('Project ID'),
    },
    async ({ id }) => {
      try {
        const project = await client.getProject(id)
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_project
  server.tool(
    'create_project',
    'Create a new project from a local path, git URL, or existing repository',
    {
      name: z.string().describe('Project name'),
      description: z.optional(z.string()).describe('Project description'),
      repositoryId: z.optional(z.string()).describe('Link to existing repository ID'),
      path: z.optional(z.string()).describe('Create from local directory path'),
      url: z.optional(z.string()).describe('Clone from git URL'),
      targetDir: z.optional(z.string()).describe('Target directory for cloning (only with url)'),
      folderName: z.optional(z.string()).describe('Folder name for cloned repo (only with url)'),
    },
    async ({ name, description, repositoryId, path, url, targetDir, folderName }) => {
      try {
        const project = await client.createProject({
          name,
          description,
          repositoryId,
          path,
          url,
          targetDir,
          folderName,
        })
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_project
  server.tool(
    'update_project',
    'Update project metadata (name, description, or status)',
    {
      id: z.string().describe('Project ID'),
      name: z.optional(z.string()).describe('New name'),
      description: z.optional(z.string()).describe('New description'),
      status: z.optional(ProjectStatusSchema).describe('New status (active or archived)'),
    },
    async ({ id, name, description, status }) => {
      try {
        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (description !== undefined) updates.description = description
        if (status !== undefined) updates.status = status
        const project = await client.updateProject(id, updates)
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_project
  server.tool(
    'delete_project',
    'Delete a project and optionally its directory and app',
    {
      id: z.string().describe('Project ID'),
      deleteDirectory: z.boolean().default(false).describe('Also delete the repository directory from disk'),
      deleteApp: z.boolean().default(false).describe('Also delete the linked app'),
    },
    async ({ id, deleteDirectory, deleteApp }) => {
      try {
        const result = await client.deleteProject(id, { deleteDirectory, deleteApp })
        return formatSuccess({ deleted: id, ...result })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // scan_projects
  server.tool(
    'scan_projects',
    'Scan a directory for git repositories and check which have projects',
    {
      directory: z.optional(z.string()).describe('Directory to scan (defaults to configured git repos dir)'),
    },
    async ({ directory }) => {
      try {
        const result = await client.scanProjects(directory)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // ==========================================================================
  // App Tools
  // ==========================================================================

  // list_apps
  server.tool(
    'list_apps',
    'List all deployed apps with optional filtering by status',
    {
      status: z.optional(AppStatusSchema).describe('Filter by status'),
    },
    async ({ status }) => {
      try {
        let apps = await client.listApps()
        if (status) {
          apps = apps.filter((a) => a.status === status)
        }
        return formatSuccess(apps)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app
  server.tool(
    'get_app',
    'Get details of a specific app including services and repository',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const app = await client.getApp(id)
        return formatSuccess(app)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_app
  server.tool(
    'create_app',
    'Create a new app for deployment from a repository',
    {
      name: z.string().describe('App name'),
      repositoryId: z.string().describe('Repository ID to deploy from'),
      branch: z.optional(z.string()).describe('Git branch (default: main)'),
      composeFile: z.optional(z.string()).describe('Path to compose file (auto-detected if omitted)'),
      autoDeployEnabled: z.boolean().default(false).describe('Enable auto-deploy on git push'),
      noCacheBuild: z.boolean().default(false).describe('Disable Docker build cache'),
    },
    async ({ name, repositoryId, branch, composeFile, autoDeployEnabled, noCacheBuild }) => {
      try {
        const app = await client.createApp({
          name,
          repositoryId,
          branch,
          composeFile,
          autoDeployEnabled,
          noCacheBuild,
        })
        return formatSuccess(app)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // deploy_app
  server.tool(
    'deploy_app',
    'Trigger a deployment for an app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.deployApp(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // stop_app
  server.tool(
    'stop_app',
    'Stop a running app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.stopApp(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app_logs
  server.tool(
    'get_app_logs',
    'Get logs from an app, optionally for a specific service',
    {
      id: z.string().describe('App ID'),
      service: z.optional(z.string()).describe('Service name (all services if omitted)'),
      tail: z.optional(z.number()).describe('Number of lines to return (default: 100)'),
    },
    async ({ id, service, tail }) => {
      try {
        const result = await client.getAppLogs(id, { service, tail })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app_status
  server.tool(
    'get_app_status',
    'Get the current container status for an app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.getAppStatus(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_deployments
  server.tool(
    'list_deployments',
    'Get deployment history for an app',
    {
      appId: z.string().describe('App ID'),
    },
    async ({ appId }) => {
      try {
        const deployments = await client.listDeployments(appId)
        return formatSuccess(deployments)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_app
  server.tool(
    'delete_app',
    'Delete an app and optionally stop its containers',
    {
      id: z.string().describe('App ID'),
      stopContainers: z.boolean().default(true).describe('Stop running containers before deletion'),
    },
    async ({ id, stopContainers }) => {
      try {
        await client.deleteApp(id, stopContainers)
        return formatSuccess({ deleted: id })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // ==========================================================================
  // Filesystem Tools
  // ==========================================================================

  // list_directory
  server.tool(
    'list_directory',
    'List contents of a directory',
    {
      path: z.optional(z.string()).describe('Directory path (default: home directory)'),
    },
    async ({ path }) => {
      try {
        const result = await client.listDirectory(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_file_tree
  server.tool(
    'get_file_tree',
    'Get recursive file tree for a directory',
    {
      root: z.string().describe('Root directory path'),
    },
    async ({ root }) => {
      try {
        const result = await client.getFileTree(root)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // read_file
  server.tool(
    'read_file',
    'Read file contents (with path traversal protection)',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      maxLines: z.optional(z.number()).describe('Maximum lines to return (default: 5000)'),
    },
    async ({ path, root, maxLines }) => {
      try {
        const result = await client.readFile(path, root, maxLines)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // write_file
  server.tool(
    'write_file',
    'Write content to an existing file (with path traversal protection)',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      content: z.string().describe('File content to write'),
    },
    async ({ path, root, content }) => {
      try {
        const result = await client.writeFile({ path, root, content })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // edit_file
  server.tool(
    'edit_file',
    'Edit a file by replacing an exact string (must be unique in file). The old_string must appear exactly once in the file.',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      old_string: z.string().describe('Exact string to find (must appear exactly once)'),
      new_string: z.string().describe('String to replace it with'),
    },
    async ({ path, root, old_string, new_string }) => {
      try {
        const result = await client.editFile({ path, root, old_string, new_string })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // file_stat
  server.tool(
    'file_stat',
    'Get file or directory metadata',
    {
      path: z.string().describe('Path to check'),
    },
    async ({ path }) => {
      try {
        const result = await client.getPathStat(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // is_git_repo
  server.tool(
    'is_git_repo',
    'Check if a directory is a git repository',
    {
      path: z.string().describe('Directory path to check'),
    },
    async ({ path }) => {
      try {
        const result = await client.isGitRepo(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
