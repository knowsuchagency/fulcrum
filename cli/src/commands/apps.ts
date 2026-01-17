import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'
import { CliError, ExitCodes } from '../utils/errors'
import type { App, Deployment } from '@shared/types'

const VALID_STATUSES = ['stopped', 'building', 'running', 'failed'] as const

function formatApp(app: App): void {
  console.log(`${app.name}`)
  console.log(`  ID:           ${app.id}`)
  console.log(`  Status:       ${app.status}`)
  console.log(`  Branch:       ${app.branch}`)
  console.log(`  Compose:      ${app.composeFile}`)
  console.log(`  Auto-deploy:  ${app.autoDeployEnabled ? 'enabled' : 'disabled'}`)
  if (app.lastDeployedAt) {
    console.log(`  Last deploy:  ${new Date(app.lastDeployedAt).toLocaleString()}`)
  }
  if (app.repository) {
    console.log(`  Repository:   ${app.repository.displayName} (${app.repository.path})`)
  }
  if (app.services && app.services.length > 0) {
    console.log(`  Services:`)
    for (const svc of app.services) {
      const exposed = svc.exposed ? `→ ${svc.domain || 'exposed'}` : 'internal'
      const port = svc.containerPort ? `:${svc.containerPort}` : ''
      console.log(`    - ${svc.serviceName}${port} (${exposed})`)
    }
  }
}

function formatAppList(apps: App[]): void {
  if (apps.length === 0) {
    console.log('No apps found')
    return
  }

  // Group by status
  const byStatus = {
    running: apps.filter((a) => a.status === 'running'),
    building: apps.filter((a) => a.status === 'building'),
    stopped: apps.filter((a) => a.status === 'stopped'),
    failed: apps.filter((a) => a.status === 'failed'),
  }

  for (const [status, statusApps] of Object.entries(byStatus)) {
    if (statusApps.length === 0) continue
    console.log(`\n${status.toUpperCase()} (${statusApps.length})`)
    for (const app of statusApps) {
      const repoName = app.repository?.displayName || 'unknown'
      console.log(`  ${app.name} (${repoName})`)
      console.log(`    ${app.id} · ${app.branch}`)
    }
  }
}

function formatDeploymentList(deployments: Deployment[]): void {
  if (deployments.length === 0) {
    console.log('No deployments found')
    return
  }

  console.log(`\nDeployment History (${deployments.length} total):`)
  for (const d of deployments.slice(0, 10)) {
    const date = new Date(d.startedAt).toLocaleString()
    const commit = d.gitCommit ? d.gitCommit.substring(0, 7) : 'unknown'
    const message = d.gitMessage ? ` - ${d.gitMessage.substring(0, 50)}` : ''
    console.log(`  [${d.status}] ${date} (${commit})${message}`)
    if (d.errorMessage) console.log(`    Error: ${d.errorMessage}`)
  }
  if (deployments.length > 10) {
    console.log(`  ... and ${deployments.length - 10} more`)
  }
}

export async function handleAppsCommand(
  action: string | undefined,
  positional: string[],
  flags: Record<string, string>
) {
  const client = new ViboraClient(flags.url, flags.port)

  switch (action) {
    case 'list': {
      // Validate status filter
      let statusFilter: typeof VALID_STATUSES[number] | undefined
      if (flags.status) {
        const status = flags.status.toLowerCase() as typeof VALID_STATUSES[number]
        if (!VALID_STATUSES.includes(status)) {
          throw new CliError(
            'INVALID_STATUS',
            `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(', ')}`,
            ExitCodes.INVALID_ARGS
          )
        }
        statusFilter = status
      }

      let apps = await client.listApps()

      if (statusFilter) {
        apps = apps.filter((a) => a.status === statusFilter)
      }

      if (isJsonOutput()) {
        output(apps)
      } else {
        formatAppList(apps)
      }
      break
    }

    case 'get': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }
      const app = await client.getApp(id)
      if (isJsonOutput()) {
        output(app)
      } else {
        formatApp(app)
      }
      break
    }

    case 'create': {
      const name = flags.name
      const repositoryId = flags['repository-id'] || flags['repo-id']

      if (!name) {
        throw new CliError('MISSING_NAME', '--name is required', ExitCodes.INVALID_ARGS)
      }
      if (!repositoryId) {
        throw new CliError('MISSING_REPO_ID', '--repository-id is required', ExitCodes.INVALID_ARGS)
      }

      const app = await client.createApp({
        name,
        repositoryId,
        branch: flags.branch,
        composeFile: flags['compose-file'],
        autoDeployEnabled: flags['auto-deploy'] === 'true',
        noCacheBuild: flags['no-cache'] === 'true',
      })

      if (isJsonOutput()) {
        output(app)
      } else {
        console.log(`Created app: ${app.name}`)
        console.log(`  ID: ${app.id}`)
        console.log(`  Status: ${app.status}`)
      }
      break
    }

    case 'update': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const updates: Record<string, unknown> = {}
      if (flags.name !== undefined) updates.name = flags.name
      if (flags.branch !== undefined) updates.branch = flags.branch
      if (flags['auto-deploy'] !== undefined) {
        updates.autoDeployEnabled = flags['auto-deploy'] === 'true'
      }
      if (flags['no-cache'] !== undefined) {
        updates.noCacheBuild = flags['no-cache'] === 'true'
      }
      if (flags.notifications !== undefined) {
        updates.notificationsEnabled = flags.notifications === 'true'
      }

      if (Object.keys(updates).length === 0) {
        throw new CliError(
          'NO_UPDATES',
          'No updates provided. Use --name, --branch, --auto-deploy, --no-cache, or --notifications',
          ExitCodes.INVALID_ARGS
        )
      }

      const app = await client.updateApp(id, updates)
      if (isJsonOutput()) {
        output(app)
      } else {
        console.log(`Updated app: ${app.name}`)
      }
      break
    }

    case 'delete': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const keepContainers = flags['keep-containers'] === 'true' || flags['keep-containers'] === ''
      await client.deleteApp(id, !keepContainers)
      if (isJsonOutput()) {
        output({ deleted: id })
      } else {
        console.log(`Deleted app: ${id}`)
      }
      break
    }

    case 'deploy': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.deployApp(id)
      if (isJsonOutput()) {
        output(result)
      } else {
        if (result.success) {
          console.log(`Deployment started for app: ${id}`)
          if (result.deployment) {
            console.log(`  Deployment ID: ${result.deployment.id}`)
          }
        } else {
          console.log(`Deployment failed: ${result.error}`)
        }
      }
      break
    }

    case 'stop': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const result = await client.stopApp(id)
      if (isJsonOutput()) {
        output(result)
      } else {
        if (result.success) {
          console.log(`Stopped app: ${id}`)
        } else {
          console.log(`Failed to stop app: ${result.error}`)
        }
      }
      break
    }

    case 'logs': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const tail = flags.tail ? parseInt(flags.tail, 10) : undefined
      const result = await client.getAppLogs(id, {
        service: flags.service,
        tail,
      })
      if (isJsonOutput()) {
        output(result)
      } else {
        console.log(result.logs)
      }
      break
    }

    case 'status': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const status = await client.getAppStatus(id)
      if (isJsonOutput()) {
        output(status)
      } else {
        if (status.containers.length === 0) {
          console.log('No containers running')
        } else {
          console.log('Containers:')
          for (const c of status.containers) {
            const ports = c.ports.length > 0 ? ` (${c.ports.join(', ')})` : ''
            console.log(`  ${c.service}: ${c.status} [${c.replicas}]${ports}`)
          }
        }
      }
      break
    }

    case 'deployments': {
      const [id] = positional
      if (!id) {
        throw new CliError('MISSING_ID', 'App ID required', ExitCodes.INVALID_ARGS)
      }

      const deployments = await client.listDeployments(id)
      if (isJsonOutput()) {
        output(deployments)
      } else {
        formatDeploymentList(deployments)
      }
      break
    }

    default:
      throw new CliError(
        'UNKNOWN_ACTION',
        `Unknown action: ${action}. Valid: list, get, create, update, delete, deploy, stop, logs, status, deployments`,
        ExitCodes.INVALID_ARGS
      )
  }
}
