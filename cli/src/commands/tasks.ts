import { basename } from 'node:path'
import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { TaskStatus, Task } from '@shared/types'

// DONE is intentionally excluded - tasks complete automatically when PRs merge
const VALID_STATUSES: TaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'CANCELED']

function formatTask(task: Task): void {
  console.log(`${task.title}`)
  console.log(`  ID:       ${task.id}`)
  console.log(`  Status:   ${task.status}`)
  if (task.repoName) console.log(`  Repo:     ${task.repoName}`)
  if (task.branch) console.log(`  Branch:   ${task.branch}`)
  if (task.prUrl) console.log(`  PR:       ${task.prUrl}`)
  if (task.projectId) console.log(`  Project:  ${task.projectId}`)
  if (task.labels && task.labels.length > 0) console.log(`  Labels:   ${task.labels.join(', ')}`)
  if (task.dueDate) console.log(`  Due:      ${task.dueDate}`)
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
  const client = new ViboraClient(flags.url, flags.port)

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
      if (isJsonOutput()) {
        output(task)
      } else {
        formatTask(task)
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

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, create, update, move, delete, add-label, remove-label, set-due-date, add-dependency, remove-dependency, list-dependencies, labels`,
        ExitCodes.INVALID_ARGS
      )
  }
}
