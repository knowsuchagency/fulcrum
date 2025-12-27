import { basename } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViboraClient } from '../client'
import { formatSuccess, handleToolError } from './utils'

const TaskStatusSchema = z.enum(['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'])

export function registerTools(server: McpServer, client: ViboraClient) {
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

  // get_current_task
  server.tool(
    'get_current_task',
    'Get the task associated with the current working directory (if any)',
    {
      path: z.optional(z.string()).describe('Override the working directory path'),
    },
    async ({ path }) => {
      try {
        const cwd = path ?? process.cwd()
        const tasks = await client.listTasks()

        // Find task whose worktreePath matches or contains the cwd
        const task = tasks.find((t) => {
          if (!t.worktreePath) return false
          return cwd === t.worktreePath || cwd.startsWith(t.worktreePath + '/')
        })

        if (!task) {
          return formatSuccess({ task: null, message: 'No task found for this directory' })
        }

        return formatSuccess(task)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
