import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { nanoid } from 'nanoid'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { apps, appServices, deployments, repositories } from '../db/schema'
import { findComposeFile } from '../services/compose-parser'
import { deployApp, stopApp, getDeploymentHistory, getProjectName } from '../services/deployment'
import { stackServices, serviceLogs } from '../services/docker-swarm'
import { checkDockerInstalled, checkDockerRunning } from '../services/docker-compose'
import { refreshGitWatchers } from '../services/git-watcher'
import type { App, AppService } from '../db/schema'

const app = new Hono()

// Types for API responses
interface AppWithServices extends Omit<App, 'environmentVariables'> {
  environmentVariables?: Record<string, string>
  services: AppService[]
  repository?: {
    id: string
    path: string
    displayName: string
  }
}

// Transform to API response
function toAppResponse(row: App, services: AppService[] = [], repo?: typeof repositories.$inferSelect): AppWithServices {
  // Parse environmentVariables from JSON string to object
  let envVars: Record<string, string> | undefined
  if (row.environmentVariables) {
    try {
      envVars = JSON.parse(row.environmentVariables)
    } catch {
      envVars = undefined
    }
  }

  return {
    ...row,
    environmentVariables: envVars,
    services,
    repository: repo
      ? {
          id: repo.id,
          path: repo.path,
          displayName: repo.displayName,
        }
      : undefined,
  }
}

// GET /api/apps - List all apps
app.get('/', async (c) => {
  const allApps = await db.query.apps.findMany({
    orderBy: [desc(apps.updatedAt)],
  })

  const result: AppWithServices[] = []
  for (const app of allApps) {
    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, app.id),
    })
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, app.repositoryId),
    })
    result.push(toAppResponse(app, services, repo ?? undefined))
  }

  return c.json(result)
})

// GET /api/apps/:id - Get single app
app.get('/:id', async (c) => {
  const id = c.req.param('id')

  const appRecord = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!appRecord) {
    return c.json({ error: 'App not found' }, 404)
  }

  const services = await db.query.appServices.findMany({
    where: eq(appServices.appId, id),
  })

  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, appRecord.repositoryId),
  })

  return c.json(toAppResponse(appRecord, services, repo ?? undefined))
})

// POST /api/apps - Create app
app.post('/', async (c) => {
  try {
    // Check Docker prerequisites before allowing app creation
    const [dockerInstalled, dockerRunning] = await Promise.all([
      checkDockerInstalled(),
      checkDockerRunning(),
    ])

    if (!dockerInstalled) {
      return c.json(
        {
          error: 'Docker is required for the Apps feature',
          code: 'DOCKER_NOT_INSTALLED',
          help: 'Install Docker from https://docs.docker.com/get-docker/',
        },
        400
      )
    }

    if (!dockerRunning) {
      return c.json(
        {
          error: 'Docker daemon is not running',
          code: 'DOCKER_NOT_RUNNING',
          help: 'Start Docker and try again',
        },
        400
      )
    }

    const body = await c.req.json<{
      name: string
      repositoryId: string
      branch?: string
      composeFile?: string
      autoDeployEnabled?: boolean
      environmentVariables?: Record<string, string>
      noCacheBuild?: boolean
      services: Array<{
        serviceName: string
        containerPort?: number
        exposed: boolean
        domain?: string
      }>
    }>()

    if (!body.name || !body.repositoryId) {
      return c.json({ error: 'name and repositoryId are required' }, 400)
    }

    // Verify repository exists
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, body.repositoryId),
    })

    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    // Find or use provided compose file
    const composeFile = body.composeFile ?? (await findComposeFile(repo.path))
    if (!composeFile) {
      return c.json({ error: 'No compose file found in repository' }, 400)
    }

    const now = new Date().toISOString()
    const appId = nanoid()

    // Create app
    await db.insert(apps).values({
      id: appId,
      name: body.name,
      repositoryId: body.repositoryId,
      branch: body.branch ?? 'main',
      composeFile,
      status: 'stopped',
      autoDeployEnabled: body.autoDeployEnabled ?? false,
      environmentVariables: body.environmentVariables ? JSON.stringify(body.environmentVariables) : null,
      noCacheBuild: body.noCacheBuild ?? false,
      createdAt: now,
      updatedAt: now,
    })

    // Create services
    if (body.services && body.services.length > 0) {
      const serviceRecords = body.services.map((s) => ({
        id: nanoid(),
        appId,
        serviceName: s.serviceName,
        containerPort: s.containerPort ?? null,
        exposed: s.exposed,
        domain: s.domain ?? null,
        status: 'stopped',
        createdAt: now,
        updatedAt: now,
      }))

      await db.insert(appServices).values(serviceRecords)
    }

    // Fetch created app with services
    const created = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    })

    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, appId),
    })

    // Refresh git watchers for auto-deploy
    refreshGitWatchers().catch(() => {})

    return c.json(toAppResponse(created!, services, repo), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create app' }, 400)
  }
})

// PATCH /api/apps/:id - Update app
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    if (!existing) {
      return c.json({ error: 'App not found' }, 404)
    }

    const body = await c.req.json<{
      name?: string
      branch?: string
      autoDeployEnabled?: boolean
      environmentVariables?: Record<string, string>
      noCacheBuild?: boolean
      notificationsEnabled?: boolean
      services?: Array<{
        id?: string
        serviceName: string
        containerPort?: number
        exposed: boolean
        domain?: string
      }>
    }>()

    const now = new Date().toISOString()

    // Update app fields
    const updateData: Partial<App> = { updatedAt: now }
    if (body.name !== undefined) updateData.name = body.name
    if (body.branch !== undefined) updateData.branch = body.branch
    if (body.autoDeployEnabled !== undefined) updateData.autoDeployEnabled = body.autoDeployEnabled
    if (body.environmentVariables !== undefined) {
      updateData.environmentVariables = JSON.stringify(body.environmentVariables)
    }
    if (body.noCacheBuild !== undefined) {
      updateData.noCacheBuild = body.noCacheBuild
    }
    if (body.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = body.notificationsEnabled
    }

    await db.update(apps).set(updateData).where(eq(apps.id, id))

    // Update services if provided
    if (body.services) {
      // Get existing services
      const existingServices = await db.query.appServices.findMany({
        where: eq(appServices.appId, id),
      })

      const existingServiceMap = new Map(existingServices.map((s) => [s.serviceName, s]))

      for (const service of body.services) {
        const existing = existingServiceMap.get(service.serviceName)

        if (existing) {
          // Update existing service
          await db
            .update(appServices)
            .set({
              containerPort: service.containerPort ?? null,
              exposed: service.exposed,
              domain: service.domain ?? null,
              updatedAt: now,
            })
            .where(eq(appServices.id, existing.id))
        } else {
          // Create new service
          await db.insert(appServices).values({
            id: nanoid(),
            appId: id,
            serviceName: service.serviceName,
            containerPort: service.containerPort ?? null,
            exposed: service.exposed,
            domain: service.domain ?? null,
            status: 'stopped',
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    // Fetch updated app
    const updated = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, id),
    })

    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, updated!.repositoryId),
    })

    // Refresh git watchers for auto-deploy
    refreshGitWatchers().catch(() => {})

    return c.json(toAppResponse(updated!, services, repo ?? undefined))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update app' }, 400)
  }
})

// DELETE /api/apps/:id - Delete app
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const stopContainers = c.req.query('stopContainers') !== 'false' // Default to true

  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!existing) {
    return c.json({ error: 'App not found' }, 404)
  }

  // Stop containers if running and requested
  if (stopContainers && existing.status === 'running') {
    await stopApp(id)
  }

  // Delete services
  await db.delete(appServices).where(eq(appServices.appId, id))

  // Delete deployments
  await db.delete(deployments).where(eq(deployments.appId, id))

  // Delete app
  await db.delete(apps).where(eq(apps.id, id))

  // Refresh git watchers for auto-deploy
  refreshGitWatchers().catch(() => {})

  return c.json({ success: true })
})

// POST /api/apps/:id/deploy - Trigger deployment (non-streaming)
app.post('/:id/deploy', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!existing) {
    return c.json({ error: 'App not found' }, 404)
  }

  // Start deployment (non-blocking for API response)
  const result = await deployApp(id, { deployedBy: 'manual' })

  if (!result.success) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({ success: true, deployment: result.deployment })
})

// GET /api/apps/:id/deploy/stream - Stream deployment logs via SSE
app.get('/:id/deploy/stream', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!existing) {
    return c.json({ error: 'App not found' }, 404)
  }

  // Disable proxy buffering for SSE (required for Cloudflare tunnels)
  c.header('X-Accel-Buffering', 'no')

  return streamSSE(c, async (stream) => {
    // Send immediate ping to establish connection
    await stream.write(': ping\n\n')

    // Start deployment with progress callback
    // Wrap in try/catch so client disconnect doesn't crash deployment
    const result = await deployApp(
      id,
      { deployedBy: 'manual' },
      async (progress) => {
        try {
          await stream.writeSSE({
            event: 'progress',
            data: JSON.stringify(progress),
          })
        } catch {
          // Client disconnected, but deployment should continue
        }
      }
    )

    // Send final result
    if (result.success) {
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ success: true, deployment: result.deployment }),
      })
    } else {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ success: false, error: result.error }),
      })
    }
  })
})

// POST /api/apps/:id/stop - Stop app
app.post('/:id/stop', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!existing) {
    return c.json({ error: 'App not found' }, 404)
  }

  const result = await stopApp(id)

  if (!result.success) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({ success: true })
})

// GET /api/apps/:id/logs - Get service logs
app.get('/:id/logs', async (c) => {
  const id = c.req.param('id')
  const service = c.req.query('service')
  const tail = parseInt(c.req.query('tail') ?? '100', 10)

  const appRecord = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!appRecord) {
    return c.json({ error: 'App not found' }, 404)
  }

  const projectName = getProjectName(id)

  // Get logs for specific service or all services
  if (service) {
    // Swarm service names are: stackName_serviceName
    const fullServiceName = `${projectName}_${service}`
    const logs = await serviceLogs(fullServiceName, tail)
    return c.json({ logs })
  }

  // Get logs from all services in the stack
  const services = await stackServices(projectName)
  const allLogs: string[] = []

  for (const svc of services) {
    const svcLogs = await serviceLogs(svc.name, tail)
    if (svcLogs) {
      allLogs.push(`=== ${svc.serviceName} ===\n${svcLogs}`)
    }
  }

  return c.json({ logs: allLogs.join('\n\n') })
})

// GET /api/apps/:id/status - Get service status
app.get('/:id/status', async (c) => {
  const id = c.req.param('id')

  const appRecord = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!appRecord) {
    return c.json({ error: 'App not found' }, 404)
  }

  const projectName = getProjectName(id)
  const services = await stackServices(projectName)

  // Map swarm services to container-like format for frontend compatibility
  const containers = services.map((svc) => {
    // Parse replicas "1/1" to determine status
    const [current, desired] = svc.replicas.split('/').map(Number)
    const isRunning = !isNaN(current) && !isNaN(desired) && current > 0 && current === desired

    return {
      name: svc.name,
      service: svc.serviceName,
      status: isRunning ? 'running' : current > 0 ? 'starting' : 'stopped',
      replicas: svc.replicas,
      ports: svc.ports,
    }
  })

  return c.json({ containers })
})

// GET /api/apps/:id/deployments - Get deployment history
app.get('/:id/deployments', async (c) => {
  const id = c.req.param('id')

  const appRecord = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!appRecord) {
    return c.json({ error: 'App not found' }, 404)
  }

  const history = await getDeploymentHistory(id)
  return c.json(history)
})

// POST /api/apps/:id/rollback/:deploymentId - Rollback to deployment
app.post('/:id/rollback/:deploymentId', async (c) => {
  const id = c.req.param('id')
  const deploymentId = c.req.param('deploymentId')

  const appRecord = await db.query.apps.findFirst({
    where: eq(apps.id, id),
  })

  if (!appRecord) {
    return c.json({ error: 'App not found' }, 404)
  }

  const targetDeployment = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  })

  if (!targetDeployment) {
    return c.json({ error: 'Deployment not found' }, 404)
  }

  // For now, rollback just redeploys
  const result = await deployApp(id, { deployedBy: 'rollback' })

  if (!result.success) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({ success: true, deployment: result.deployment })
})

export default app
