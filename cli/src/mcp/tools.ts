import { basename } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViboraClient } from '../client'
import { formatSuccess, handleToolError } from './utils'
import { searchTools, toolRegistry } from './registry'

const TaskStatusSchema = z.enum(['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'])
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
    'List all Vibora tasks with optional filtering by status or repository',
    {
      status: z.optional(TaskStatusSchema).describe('Filter by task status'),
      repo: z.optional(z.string()).describe('Filter by repository name or path'),
    },
    async ({ status, repo }) => {
      try {
        let tasks = await client.listTasks()

        if (status) {
          tasks = tasks.filter((t) => t.status === status)
        }
        if (repo) {
          const repoLower = repo.toLowerCase()
          tasks = tasks.filter(
            (t) =>
              t.repoName.toLowerCase().includes(repoLower) ||
              t.repoPath.toLowerCase().includes(repoLower)
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
    'Create a new task with an isolated git worktree',
    {
      title: z.string().describe('Task title'),
      repoPath: z.string().describe('Absolute path to the git repository'),
      baseBranch: z.string().default('main').describe('Base branch for the worktree'),
      branch: z.optional(z.string()).describe('Branch name for the task worktree (auto-generated if omitted)'),
      description: z.optional(z.string()).describe('Task description'),
    },
    async ({ title, repoPath, baseBranch, branch, description }) => {
      try {
        const repoName = basename(repoPath)
        const task = await client.createTask({
          title,
          repoPath,
          repoName,
          baseBranch,
          branch: branch ?? null,
          worktreePath: null,
          description,
          status: 'IN_PROGRESS',
        })
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
