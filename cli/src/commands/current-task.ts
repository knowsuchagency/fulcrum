import { defineCommand } from 'citty'
import { FulcrumClient, type TaskDependenciesResponse } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus, Task, TaskAttachment } from '@shared/types'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

const STATUS_MAP: Record<string, TaskStatus> = {
  review: 'IN_REVIEW',
  done: 'DONE',
  cancel: 'CANCELED',
  'in-progress': 'IN_PROGRESS',
}

function formatTask(
  task: Task,
  dependencies?: TaskDependenciesResponse,
  attachments?: TaskAttachment[]
): void {
  console.log(`${task.title}`)
  console.log(`  ID:         ${task.id}`)
  console.log(`  Status:     ${task.status}`)

  // Description
  if (task.description) {
    console.log(`  Description: ${task.description}`)
  }

  // Repository info
  if (task.repoName) console.log(`  Repo:       ${task.repoName}`)
  if (task.branch) console.log(`  Branch:     ${task.branch}`)
  if (task.worktreePath) console.log(`  Worktree:   ${task.worktreePath}`)

  // Links
  if (task.prUrl) console.log(`  PR:         ${task.prUrl}`)
  if (task.links && task.links.length > 0) {
    console.log(`  Links:      ${task.links.map((l) => l.label || l.url).join(', ')}`)
  }

  // Labels and due date
  if (task.labels && task.labels.length > 0) {
    console.log(`  Labels:     ${task.labels.join(', ')}`)
  }
  if (task.dueDate) console.log(`  Due:        ${task.dueDate}`)

  // Project
  if (task.projectId) console.log(`  Project:    ${task.projectId}`)

  // Agent info
  console.log(`  Agent:      ${task.agent}`)
  if (task.aiMode) console.log(`  AI Mode:    ${task.aiMode}`)
  if (task.agentOptions && Object.keys(task.agentOptions).length > 0) {
    console.log(`  Options:    ${JSON.stringify(task.agentOptions)}`)
  }

  // Dependencies
  if (dependencies) {
    if (dependencies.isBlocked) {
      console.log(`  Blocked:    Yes`)
    }
    if (dependencies.dependsOn.length > 0) {
      console.log(`  Depends on: ${dependencies.dependsOn.length} task(s)`)
      for (const dep of dependencies.dependsOn) {
        if (dep.task) {
          console.log(`    - ${dep.task.title} [${dep.task.status}]`)
        }
      }
    }
    if (dependencies.dependents.length > 0) {
      console.log(`  Blocking:   ${dependencies.dependents.length} task(s)`)
    }
  }

  // Attachments
  if (attachments && attachments.length > 0) {
    console.log(`  Attachments: ${attachments.length} file(s)`)
  }

  // Notes
  if (task.notes) {
    console.log(`  Notes:      ${task.notes}`)
  }

  // Timestamps
  console.log(`  Created:    ${task.createdAt}`)
  if (task.startedAt) console.log(`  Started:    ${task.startedAt}`)
}

/**
 * Finds the task associated with the current worktree.
 * Matches the current working directory (or --path) against task worktreePaths.
 */
async function findCurrentTask(client: FulcrumClient, pathOverride?: string) {
  // Check FULCRUM_TASK_ID env var first (injected by terminal session)
  if (process.env.FULCRUM_TASK_ID) {
    try {
      const task = await client.getTask(process.env.FULCRUM_TASK_ID)
      if (task) return task
    } catch {
      // Ignore error if task lookup fails (e.g. deleted task), fall back to path
    }
  }

  const currentPath = pathOverride || process.cwd()

  const tasks = await client.listTasks()

  // Find task where worktreePath matches current directory
  // We check if currentPath starts with worktreePath to handle subdirectories
  const task = tasks.find((t) => {
    if (!t.worktreePath) return false
    // Exact match or current path is inside the worktree
    return currentPath === t.worktreePath || currentPath.startsWith(t.worktreePath + '/')
  })

  if (!task) {
    throw new CliError(
      'NOT_IN_WORKTREE',
      `No task found for path: ${currentPath}. Are you inside a Fulcrum task worktree?`,
      ExitCodes.NOT_FOUND
    )
  }

  return task
}

async function handleCurrentTaskCommand(
  action: string | undefined,
  rest: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)
  const pathOverride = flags.path

  // If no action, just return the current task info
  if (!action) {
    const task = await findCurrentTask(client, pathOverride)
    if (isJsonOutput()) {
      // For JSON output, include dependencies and attachments
      const [dependencies, attachments] = await Promise.all([
        client.getTaskDependencies(task.id),
        client.listTaskAttachments(task.id),
      ])
      output({ ...task, dependencies, attachments })
    } else {
      // For human-readable output, fetch extra data
      const [dependencies, attachments] = await Promise.all([
        client.getTaskDependencies(task.id),
        client.listTaskAttachments(task.id),
      ])
      formatTask(task, dependencies, attachments)
    }
    return
  }

  // Handle PR association
  if (action === 'pr') {
    const prUrl = rest[0]
    if (!prUrl) {
      throw new CliError(
        'MISSING_PR_URL',
        'Usage: fulcrum current-task pr <url>',
        ExitCodes.INVALID_ARGS
      )
    }
    const task = await findCurrentTask(client, pathOverride)
    const updatedTask = await client.updateTask(task.id, { prUrl })
    if (isJsonOutput()) {
      output(updatedTask)
    } else {
      console.log(`Linked PR: ${prUrl}`)
    }
    return
  }

  // Handle link management
  if (action === 'link') {
    const firstArg = rest[0]

    // No args - list links
    if (!firstArg) {
      const task = await findCurrentTask(client, pathOverride)
      const links = task.links ?? []
      if (isJsonOutput()) {
        output(links)
      } else {
        if (links.length === 0) {
          console.log('No links attached to this task')
        } else {
          for (const link of links) {
            console.log(`  ${link.label || link.url}`)
            console.log(`    URL: ${link.url}`)
            console.log(`    ID:  ${link.id}`)
          }
        }
      }
      return
    }

    // --remove flag - remove a link
    if (firstArg === '--remove' || firstArg === '-r') {
      const urlOrId = rest[1]
      if (!urlOrId) {
        throw new CliError(
          'MISSING_LINK_ID',
          'Usage: fulcrum current-task link --remove <url-or-id>',
          ExitCodes.INVALID_ARGS
        )
      }
      const task = await findCurrentTask(client, pathOverride)
      const link = task.links?.find((l) => l.url === urlOrId || l.id === urlOrId)
      if (!link) {
        throw new CliError(
          'LINK_NOT_FOUND',
          `Link not found: ${urlOrId}`,
          ExitCodes.NOT_FOUND
        )
      }
      await client.removeTaskLink(task.id, link.id)
      if (isJsonOutput()) {
        output({ success: true, removed: link.id })
      } else {
        console.log(`Removed link: ${link.label || link.url}`)
      }
      return
    }

    // Add a link
    const url = firstArg
    const label = flags.label
    const task = await findCurrentTask(client, pathOverride)
    const newLink = await client.addTaskLink(task.id, url, label)
    if (isJsonOutput()) {
      output(newLink)
    } else {
      console.log(`Added link: ${newLink.label}`)
    }
    return
  }

  // Handle status change actions
  const newStatus = STATUS_MAP[action]
  if (!newStatus) {
    throw new CliError(
      'INVALID_ACTION',
      `Unknown action: ${action}. Valid actions: in-progress, review, done, cancel, pr, link`,
      ExitCodes.INVALID_ARGS
    )
  }

  const task = await findCurrentTask(client, pathOverride)
  const updatedTask = await client.moveTask(task.id, newStatus)
  if (isJsonOutput()) {
    output(updatedTask)
  } else {
    console.log(`Moved task to ${newStatus}: ${updatedTask.title}`)
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const currentTaskInfoCommand = defineCommand({
  meta: { name: 'info', description: 'Show current task info' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleCurrentTaskCommand(undefined, [], toFlags(args))
  },
})

const currentTaskPrCommand = defineCommand({
  meta: { name: 'pr', description: 'Link a PR to current task' },
  args: {
    ...globalArgs,
    url: { type: 'positional' as const, description: 'PR URL', required: true },
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleCurrentTaskCommand('pr', [args.url as string], toFlags(args))
  },
})

const currentTaskLinkCommand = defineCommand({
  meta: { name: 'link', description: 'Manage task links' },
  args: {
    ...globalArgs,
    url: { type: 'positional' as const, description: 'URL to add (or --remove <id>)' },
    label: { type: 'string' as const, description: 'Display label for the link' },
    remove: { type: 'string' as const, alias: 'r', description: 'Remove link by URL or ID' },
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const rest: string[] = []
    if (args.remove) {
      rest.push('--remove', args.remove as string)
    } else if (args.url) {
      rest.push(args.url as string)
    }
    await handleCurrentTaskCommand('link', rest, toFlags(args))
  },
})

const currentTaskReviewCommand = defineCommand({
  meta: { name: 'review', description: 'Move task to IN_REVIEW' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleCurrentTaskCommand('review', [], toFlags(args))
  },
})

const currentTaskDoneCommand = defineCommand({
  meta: { name: 'done', description: 'Move task to DONE' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleCurrentTaskCommand('done', [], toFlags(args))
  },
})

const currentTaskCancelCommand = defineCommand({
  meta: { name: 'cancel', description: 'Move task to CANCELED' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleCurrentTaskCommand('cancel', [], toFlags(args))
  },
})

export const currentTaskCommand = defineCommand({
  meta: { name: 'current-task', description: 'Manage the current worktree task' },
  args: {
    ...globalArgs,
    path: { type: 'string' as const, description: 'Path override (default: cwd)' },
  },
  subCommands: {
    info: currentTaskInfoCommand,
    pr: currentTaskPrCommand,
    link: currentTaskLinkCommand,
    review: currentTaskReviewCommand,
    done: currentTaskDoneCommand,
    cancel: currentTaskCancelCommand,
  },
  async run({ args }) {
    // Default: show current task info
    setupJsonOutput(args)
    await handleCurrentTaskCommand(undefined, [], toFlags(args))
  },
})
