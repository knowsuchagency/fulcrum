import { basename } from 'node:path'
import { defineCommand } from 'citty'
import { FulcrumClient, type TaskDependenciesResponse } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus, Task, TaskAttachment } from '@shared/types'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

// DONE is intentionally excluded - tasks complete automatically when PRs merge
const VALID_STATUSES: TaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'CANCELED']

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

  // Dependencies (only shown for detailed view)
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

  // Attachments (only shown for detailed view)
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

function formatTaskList(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log('No tasks found')
    return
  }

  // Group by status
  const byStatus = {
    TO_DO: tasks.filter((t) => t.status === 'TO_DO'),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
    IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
    CANCELED: tasks.filter((t) => t.status === 'CANCELED'),
  }

  for (const [status, statusTasks] of Object.entries(byStatus)) {
    if (statusTasks.length === 0) continue
    console.log(`\n${status} (${statusTasks.length})`)
    for (const task of statusTasks) {
      const branch = task.branch ? ` [${task.branch}]` : ''
      const labels = task.labels && task.labels.length > 0 ? ` {${task.labels.join(', ')}}` : ''
      const dueDate = task.dueDate ? ` (due: ${task.dueDate})` : ''
      console.log(`  ${task.title}${branch}${labels}${dueDate}`)
      const repoInfo = task.repoName ? ` · ${task.repoName}` : ''
      console.log(`    ${task.id}${repoInfo}`)
    }
  }
}

export async function handleTasksCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new FulcrumClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      // Validate status filter before making network call
      let statusFilter: TaskStatus | undefined
      if (flags.status) {
        const status = flags.status.toUpperCase() as TaskStatus
        if (!VALID_STATUSES.includes(status) && status !== 'DONE') {
          throw new CliError(
            'INVALID_STATUS',
            `Invalid status: ${flags.status}. Valid: ${[...VALID_STATUSES, 'DONE'].join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        statusFilter = status
      }

      let tasks = await client.listTasks()

      // Apply filters
      if (statusFilter) {
        tasks = tasks.filter((t) => t.status === statusFilter)
      }

      if (flags.repo) {
        const repoFilter = flags.repo.toLowerCase()
        tasks = tasks.filter(
          (t) =>
            (t.repoName && t.repoName.toLowerCase().includes(repoFilter)) ||
            (t.repoPath && t.repoPath.toLowerCase().includes(repoFilter))
        )
      }

      if (flags['project-id']) {
        tasks = tasks.filter((t) => t.projectId === flags['project-id'])
      }

      if (flags.orphans === 'true' || flags.orphans === '') {
        tasks = tasks.filter((t) => t.projectId === null)
      }

      if (flags.label) {
        const labelFilter = flags.label.toLowerCase()
        tasks = tasks.filter((t) => t.labels && t.labels.some((l) => l.toLowerCase() === labelFilter))
      }

      // Text search across title, labels, and project name
      if (flags.search) {
        const searchLower = flags.search.toLowerCase()
        // Note: Project name search would require fetching projects, keeping it simple for CLI
        tasks = tasks.filter((t) => {
          // Check title
          if (t.title.toLowerCase().includes(searchLower)) return true
          // Check labels
          if (t.labels && t.labels.some((l) => l.toLowerCase().includes(searchLower))) return true
          return false
        })
      }

      if (isJsonOutput()) {
        output(tasks)
      } else {
        formatTaskList(tasks)
      }
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      const task = await client.getTask(id)
      // Fetch dependencies and attachments for comprehensive output
      const [dependencies, attachments] = await Promise.all([
        client.getTaskDependencies(id),
        client.listTaskAttachments(id),
      ])
      if (isJsonOutput()) {
        output({ ...task, dependencies, attachments })
      } else {
        formatTask(task, dependencies, attachments)
      }
      break
    }

    case 'create': {
      const title = flags.title
      const repoPath = flags.repo || flags['repo-path']
      const baseBranch = flags['base-branch'] || 'main'
      const branch = flags.branch
      const description = flags.description || ''
      const projectId = flags['project-id']
      const repositoryId = flags['repository-id']
      const labelsStr = flags.labels
      const dueDate = flags['due-date']
      const status = (flags.status?.toUpperCase() || 'IN_PROGRESS') as TaskStatus

      if (!title) {
        throw new CliError('MISSING_TITLE', '--title is required', ExitCodes.INVALID_ARGS)
      }

      // Parse labels from comma-separated string
      const labels = labelsStr ? labelsStr.split(',').map((l) => l.trim()).filter(Boolean) : undefined

      // Validate status if provided
      if (flags.status && !VALID_STATUSES.includes(status)) {
        throw new CliError(
          'INVALID_STATUS',
          `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }

      const repoName = repoPath ? (flags['repo-name'] || basename(repoPath)) : undefined

      const task = await client.createTask({
        title,
        description,
        repoPath: repoPath || null,
        repoName: repoName || null,
        baseBranch: repoPath ? baseBranch : null,
        branch: branch || null,
        worktreePath: flags['worktree-path'] || null,
        status,
        projectId: projectId || null,
        repositoryId: repositoryId || null,
        labels,
        dueDate: dueDate || null,
      })

      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Created task: ${task.title}`)
        console.log(`  ID: ${task.id}`)
        console.log(`  Status: ${task.status}`)
        if (task.worktreePath) console.log(`  Worktree: ${task.worktreePath}`)
        if (task.labels && task.labels.length > 0) console.log(`  Labels: ${task.labels.join(', ')}`)
        if (task.dueDate) console.log(`  Due: ${task.dueDate}`)
      }
      break
    }

    case 'update': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const updates: Record<string, unknown> = {}
      if (flags.title !== undefined) updates.title = flags.title
      if (flags.description !== undefined) updates.description = flags.description

      if (Object.keys(updates).length === 0) {
        throw new CliError(
          'NO_UPDATES',
          'No updates provided. Use --title or --description',
          ExitCodes.INVALID_ARGS
        )
      }

      const task = await client.updateTask(id, updates)
      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Updated task: ${task.title}`)
      }
      break
    }

    case 'move': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const status = (flags.status?.toUpperCase() || '') as TaskStatus
      if (!status || !VALID_STATUSES.includes(status)) {
        throw new CliError(
          'INVALID_STATUS',
          `--status is required. Valid: ${VALID_STATUSES.join(', ')}`,
          ExitCodes.INVALID_ARGS
        )
      }

      const position = flags.position ? parseInt(flags.position, 10) : undefined
      const task = await client.moveTask(id, status, position)
      if (isJsonOutput()) {
        output(task)
      } else {
        console.log(`Moved task to ${status}: ${task.title}`)
      }
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const deleteLinkedWorktree = flags['delete-worktree'] === 'true' || flags['delete-worktree'] === ''
      await client.deleteTask(id, deleteLinkedWorktree)
      if (isJsonOutput()) {
        output({ deleted: id })
      } else {
        console.log(`Deleted task: ${id}`)
      }
      break
    }

    case 'add-label': {
      const [id, label] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      if (!label) {
        throw new CliError('MISSING_LABEL', 'Label required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.addTaskLabel(id, label)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Added label "${label}" to task`)
        console.log(`  Labels: ${result.labels.join(', ')}`)
      }
      break
    }

    case 'remove-label': {
      const [id, label] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      if (!label) {
        throw new CliError('MISSING_LABEL', 'Label required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.removeTaskLabel(id, label)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Removed label "${label}" from task`)
        console.log(`  Labels: ${result.labels.length > 0 ? result.labels.join(', ') : '(none)'}`)
      }
      break
    }

    case 'set-due-date': {
      const [id, date] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      // date can be null/empty to clear
      const dueDate = date && date !== 'null' && date !== 'none' ? date : null

      const result = await client.setTaskDueDate(id, dueDate)
      if (isJsonOutput()) {
        output(result)
      } else {
        if (result.dueDate) {
          console.log(`Set due date: ${result.dueDate}`)
        } else {
          console.log('Cleared due date')
        }
      }
      break
    }

    case 'add-dependency': {
      const [id, dependsOnId] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      if (!dependsOnId) {
        throw new CliError('MISSING_DEPENDS_ON', 'Depends-on task ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.addTaskDependency(id, dependsOnId)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Added dependency: task ${id} now depends on ${dependsOnId}`)
      }
      break
    }

    case 'remove-dependency': {
      const [id, depId] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }
      if (!depId) {
        throw new CliError('MISSING_DEP_ID', 'Dependency ID required', ExitCodes.INVALID_ARGS)
      }

      await client.removeTaskDependency(id, depId)
      if (isJsonOutput()) {
        output({ success: true })
      } else {
        console.log('Removed dependency')
      }
      break
    }

    case 'list-dependencies': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.getTaskDependencies(id)
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(`Dependencies for task ${id}:`)
        console.log(`  Blocked: ${result.isBlocked ? 'Yes' : 'No'}`)
        console.log(`\n  Depends on (${result.dependsOn.length}):`)
        for (const dep of result.dependsOn) {
          const task = dep.task
          if (task) {
            console.log(`    ${task.title} [${task.status}]`)
            console.log(`      ${task.id}`)
          }
        }
        console.log(`\n  Dependents (${result.dependents.length}):`)
        for (const dep of result.dependents) {
          const task = dep.task
          if (task) {
            console.log(`    ${task.title} [${task.status}]`)
            console.log(`      ${task.id}`)
          }
        }
      }
      break
    }

    case 'labels': {
      const tasks = await client.listTasks()
      const labelCounts = new Map<string, number>()

      for (const task of tasks) {
        if (task.labels) {
          for (const label of task.labels) {
            labelCounts.set(label, (labelCounts.get(label) || 0) + 1)
          }
        }
      }

      let labels = Array.from(labelCounts.entries())

      // Apply search filter if provided
      if (flags.search) {
        const searchLower = flags.search.toLowerCase()
        labels = labels.filter(([name]) => name.toLowerCase().includes(searchLower))
      }

      // Sort by count descending
      labels.sort((a, b) => b[1] - a[1])

      if (isJsonOutput()) {
        output(labels.map(([name, count]) => ({ name, count })))
      } else {
        if (labels.length === 0) {
          console.log('No labels found')
        } else {
          console.log('\nLabels:')
          for (const [name, count] of labels) {
            console.log(`  ${name} (${count})`)
          }
        }
      }
      break
    }

    case 'attachments': {
      // Sub-command for attachments: list, upload, delete, path
      const [subAction, taskIdOrFile, fileOrAttachmentId] = positional

      if (!subAction || subAction === 'help') {
        console.log('Usage:')
        console.log('  fulcrum tasks attachments list <task-id>')
        console.log('  fulcrum tasks attachments upload <task-id> <file-path>')
        console.log('  fulcrum tasks attachments delete <task-id> <attachment-id>')
        console.log('  fulcrum tasks attachments path <task-id> <attachment-id>')
        break
      }

      if (subAction === 'list') {
        const taskId = taskIdOrFile
        if (!taskId) {
          throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
        }
        const attachments = await client.listTaskAttachments(taskId)
        if (isJsonOutput()) {
          output(attachments)
        } else {
          if (attachments.length === 0) {
            console.log('No attachments')
          } else {
            console.log(`\nAttachments (${attachments.length}):`)
            for (const att of attachments) {
              console.log(`  ${att.filename}`)
              console.log(`    ID:   ${att.id}`)
              console.log(`    Type: ${att.mimeType}`)
              console.log(`    Size: ${att.size} bytes`)
            }
          }
        }
        break
      }

      if (subAction === 'upload') {
        const taskId = taskIdOrFile
        const filePath = fileOrAttachmentId
        if (!taskId) {
          throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
        }
        if (!filePath) {
          throw new CliError('MISSING_FILE', 'File path required', ExitCodes.INVALID_ARGS)
        }
        const attachment = await client.uploadTaskAttachment(taskId, filePath)
        if (isJsonOutput()) {
          output(attachment)
        } else {
          console.log(`Uploaded: ${attachment.filename}`)
          console.log(`  ID: ${attachment.id}`)
        }
        break
      }

      if (subAction === 'delete') {
        const taskId = taskIdOrFile
        const attachmentId = fileOrAttachmentId
        if (!taskId) {
          throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
        }
        if (!attachmentId) {
          throw new CliError('MISSING_ATTACHMENT_ID', 'Attachment ID required', ExitCodes.INVALID_ARGS)
        }
        await client.deleteTaskAttachment(taskId, attachmentId)
        if (isJsonOutput()) {
          output({ success: true, deleted: attachmentId })
        } else {
          console.log(`Deleted attachment: ${attachmentId}`)
        }
        break
      }

      if (subAction === 'path') {
        const taskId = taskIdOrFile
        const attachmentId = fileOrAttachmentId
        if (!taskId) {
          throw new CliError('MISSING_ID', 'Task ID required', ExitCodes.INVALID_ARGS)
        }
        if (!attachmentId) {
          throw new CliError('MISSING_ATTACHMENT_ID', 'Attachment ID required', ExitCodes.INVALID_ARGS)
        }
        const result = await client.getTaskAttachmentPath(taskId, attachmentId)
        if (isJsonOutput()) {
          output(result)
        } else {
          console.log(`Path: ${result.path}`)
          console.log(`Filename: ${result.filename}`)
          console.log(`Type: ${result.mimeType}`)
        }
        break
      }

      throw new CliError(
        'UNKNOWN_SUBACTION',
        `Unknown attachments action: ${subAction}. Valid: list, upload, delete, path`,
        ExitCodes.INVALID_ARGS
      )
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, create, update, move, delete, add-label, remove-label, set-due-date, add-dependency, remove-dependency, list-dependencies, labels, attachments`,
        ExitCodes.INVALID_ARGS
      )
  }
}

// ============================================================================
// Command Definitions
// ============================================================================

const tasksListCommand = defineCommand({
  meta: { name: 'list', description: 'List tasks' },
  args: {
    ...globalArgs,
    status: { type: 'string' as const, description: 'Filter by status' },
    repo: { type: 'string' as const, description: 'Filter by repo name/path' },
    'project-id': { type: 'string' as const, description: 'Filter by project ID' },
    orphans: { type: 'boolean' as const, description: 'Show only orphan tasks' },
    label: { type: 'string' as const, description: 'Filter by label' },
    search: { type: 'string' as const, description: 'Search in title and labels' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('list', [], toFlags(args))
  },
})

const tasksGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get task details' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('get', [args.id as string], toFlags(args))
  },
})

const tasksCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create a task' },
  args: {
    ...globalArgs,
    title: { type: 'string' as const, description: 'Task title', required: true },
    repo: { type: 'string' as const, alias: 'repo-path', description: 'Repository path' },
    'base-branch': { type: 'string' as const, description: 'Base branch (default: main)' },
    branch: { type: 'string' as const, description: 'Branch name' },
    description: { type: 'string' as const, description: 'Task description' },
    'project-id': { type: 'string' as const, description: 'Project ID' },
    'repository-id': { type: 'string' as const, description: 'Repository ID' },
    labels: { type: 'string' as const, description: 'Comma-separated labels' },
    'due-date': { type: 'string' as const, description: 'Due date (YYYY-MM-DD)' },
    status: { type: 'string' as const, description: 'Initial status (default: IN_PROGRESS)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('create', [], toFlags(args))
  },
})

const tasksUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update task metadata' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    title: { type: 'string' as const, description: 'New title' },
    description: { type: 'string' as const, description: 'New description' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('update', [args.id as string], toFlags(args))
  },
})

const tasksMoveCommand = defineCommand({
  meta: { name: 'move', description: 'Move task to a status' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    status: { type: 'string' as const, description: 'Target status', required: true },
    position: { type: 'string' as const, description: 'Position in column' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('move', [args.id as string], toFlags(args))
  },
})

const tasksDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a task' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    'delete-worktree': { type: 'boolean' as const, description: 'Also delete the worktree' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('delete', [args.id as string], toFlags(args))
  },
})

const tasksAddLabelCommand = defineCommand({
  meta: { name: 'add-label', description: 'Add a label to a task' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    label: { type: 'positional' as const, description: 'Label to add', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('add-label', [args.id as string, args.label as string], toFlags(args))
  },
})

const tasksRemoveLabelCommand = defineCommand({
  meta: { name: 'remove-label', description: 'Remove a label from a task' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    label: { type: 'positional' as const, description: 'Label to remove', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('remove-label', [args.id as string, args.label as string], toFlags(args))
  },
})

const tasksSetDueDateCommand = defineCommand({
  meta: { name: 'set-due-date', description: 'Set or clear due date' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    date: { type: 'positional' as const, description: 'Due date (YYYY-MM-DD or null)' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('set-due-date', [args.id as string, args.date as string], toFlags(args))
  },
})

const tasksAddDependencyCommand = defineCommand({
  meta: { name: 'add-dependency', description: 'Add a task dependency' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    dependsOn: { type: 'positional' as const, description: 'Task ID to depend on', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('add-dependency', [args.id as string, args.dependsOn as string], toFlags(args))
  },
})

const tasksRemoveDependencyCommand = defineCommand({
  meta: { name: 'remove-dependency', description: 'Remove a task dependency' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
    depId: { type: 'positional' as const, description: 'Dependency ID to remove', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('remove-dependency', [args.id as string, args.depId as string], toFlags(args))
  },
})

const tasksListDependenciesCommand = defineCommand({
  meta: { name: 'list-dependencies', description: 'List task dependencies' },
  args: {
    ...globalArgs,
    id: { type: 'positional' as const, description: 'Task ID', required: true },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('list-dependencies', [args.id as string], toFlags(args))
  },
})

const tasksLabelsCommand = defineCommand({
  meta: { name: 'labels', description: 'List all labels' },
  args: {
    ...globalArgs,
    search: { type: 'string' as const, description: 'Search filter' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    await handleTasksCommand('labels', [], toFlags(args))
  },
})

const tasksAttachmentsCommand = defineCommand({
  meta: { name: 'attachments', description: 'Manage task attachments' },
  args: {
    ...globalArgs,
    action: { type: 'positional' as const, description: 'Action: list, upload, delete, path' },
    taskId: { type: 'positional' as const, description: 'Task ID' },
    fileOrId: { type: 'positional' as const, description: 'File path or attachment ID' },
  },
  async run({ args }) {
    setupJsonOutput(args)
    const positional = [args.action as string, args.taskId as string, args.fileOrId as string].filter(Boolean)
    await handleTasksCommand('attachments', positional, toFlags(args))
  },
})

export const tasksCommand = defineCommand({
  meta: { name: 'tasks', description: 'Manage tasks' },
  subCommands: {
    list: tasksListCommand,
    get: tasksGetCommand,
    create: tasksCreateCommand,
    update: tasksUpdateCommand,
    move: tasksMoveCommand,
    delete: tasksDeleteCommand,
    'add-label': tasksAddLabelCommand,
    'remove-label': tasksRemoveLabelCommand,
    'set-due-date': tasksSetDueDateCommand,
    'add-dependency': tasksAddDependencyCommand,
    'remove-dependency': tasksRemoveDependencyCommand,
    'list-dependencies': tasksListDependenciesCommand,
    labels: tasksLabelsCommand,
    attachments: tasksAttachmentsCommand,
  },
})
