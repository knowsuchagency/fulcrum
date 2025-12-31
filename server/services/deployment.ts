import { spawn } from 'child_process'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apps, appServices, deployments, repositories } from '../db/schema'
import { log } from '../lib/logger'
import { getDeploymentSettings } from '../lib/settings'
import { composeUp, composeDown, composeBuild, composePs } from './docker-compose'
import { createDnsRecord, deleteDnsRecord } from './cloudflare'
import { addRoute, removeRoute } from './caddy'
import type { Deployment } from '../db/schema'

export interface DeploymentProgress {
  stage: 'pulling' | 'building' | 'starting' | 'configuring' | 'done' | 'failed'
  message: string
  progress?: number
}

export type DeploymentProgressCallback = (progress: DeploymentProgress) => void

/**
 * Get the project name for docker compose (used for container naming)
 * Docker compose project names must be lowercase alphanumeric, hyphens, underscores
 */
export function getProjectName(appId: string): string {
  return `vibora-${appId.slice(0, 8).toLowerCase()}`
}

/**
 * Pull latest changes from git
 */
async function gitPull(repoPath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['pull', '--ff-only'], { cwd: repoPath })

    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        log.deploy.error('Git pull failed', { repoPath, stderr: stderr.slice(0, 200) })
        resolve({ success: false, error: stderr || 'Git pull failed' })
      } else {
        resolve({ success: true })
      }
    })

    proc.on('error', (err) => {
      resolve({ success: false, error: String(err) })
    })
  })
}

/**
 * Get the current git commit hash
 */
async function getGitCommit(repoPath: string): Promise<{ hash: string; message: string } | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['log', '-1', '--format=%H%n%s'], { cwd: repoPath })

    let stdout = ''
    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
      } else {
        const lines = stdout.trim().split('\n')
        resolve({
          hash: lines[0]?.slice(0, 7) ?? '',
          message: lines[1] ?? '',
        })
      }
    })

    proc.on('error', () => {
      resolve(null)
    })
  })
}

/**
 * Deploy an app
 */
export async function deployApp(
  appId: string,
  options: { deployedBy?: 'manual' | 'auto' | 'rollback' } = {},
  onProgress?: DeploymentProgressCallback
): Promise<{ success: boolean; deployment?: Deployment; error?: string }> {
  const deployedBy = options.deployedBy ?? 'manual'

  // Get app and repository
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  })

  if (!app) {
    return { success: false, error: 'App not found' }
  }

  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, app.repositoryId),
  })

  if (!repo) {
    return { success: false, error: 'Repository not found' }
  }

  // Create deployment record
  const deploymentId = nanoid()
  const now = new Date().toISOString()

  await db.insert(deployments).values({
    id: deploymentId,
    appId,
    status: 'pending',
    deployedBy,
    startedAt: now,
    createdAt: now,
  })

  // Update app status
  await db.update(apps).set({ status: 'building', updatedAt: now }).where(eq(apps.id, appId))

  const projectName = getProjectName(app.id)
  const buildLogs: string[] = []

  // Parse environment variables from app
  let env: Record<string, string> | undefined
  if (app.environmentVariables) {
    try {
      env = JSON.parse(app.environmentVariables)
    } catch {
      log.deploy.warn('Failed to parse environment variables', { appId })
    }
  }

  try {
    // Stage 1: Pull latest code
    onProgress?.({ stage: 'pulling', message: 'Pulling latest code...' })

    const pullResult = await gitPull(repo.path)
    if (!pullResult.success) {
      throw new Error(`Git pull failed: ${pullResult.error}`)
    }

    // Get commit info
    const commitInfo = await getGitCommit(repo.path)

    // Stage 2: Build containers
    onProgress?.({ stage: 'building', message: 'Building containers...' })

    const buildResult = await composeBuild(
      {
        projectName,
        cwd: repo.path,
        composeFile: app.composeFile,
        env,
      },
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'building', message: line })
      }
    )

    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`)
    }

    // Stage 3: Start containers
    onProgress?.({ stage: 'starting', message: 'Starting containers...' })

    const upResult = await composeUp(
      {
        projectName,
        cwd: repo.path,
        composeFile: app.composeFile,
        env,
      },
      false,
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'starting', message: line })
      }
    )

    if (!upResult.success) {
      throw new Error(`Failed to start containers: ${upResult.error}`)
    }

    // Stage 4: Configure routing (DNS + Caddy)
    onProgress?.({ stage: 'configuring', message: 'Configuring DNS and proxy...' })

    const deploymentSettings = getDeploymentSettings()
    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, appId),
    })

    // Get container status to find actual ports
    const containerStatuses = await composePs({
      projectName,
      cwd: repo.path,
      composeFile: app.composeFile,
    })

    for (const service of services) {
      if (service.exposed && service.domain && service.containerPort) {
        // Find the container for this service
        const container = containerStatuses.find((c) => c.service === service.serviceName)

        // Configure Caddy reverse proxy
        const caddyResult = await addRoute(service.domain, service.containerPort)
        if (!caddyResult.success) {
          log.deploy.warn('Failed to configure Caddy route', {
            service: service.serviceName,
            error: caddyResult.error,
          })
        }

        // Configure Cloudflare DNS
        if (deploymentSettings.cloudflareApiToken && deploymentSettings.serverPublicIp) {
          const [subdomain, ...domainParts] = service.domain.split('.')
          const domain = domainParts.join('.')

          if (domain) {
            const dnsResult = await createDnsRecord(
              subdomain,
              domain,
              deploymentSettings.serverPublicIp
            )
            if (!dnsResult.success) {
              log.deploy.warn('Failed to create DNS record', {
                domain: service.domain,
                error: dnsResult.error,
              })
            }
          }
        }

        // Update service status
        await db
          .update(appServices)
          .set({
            status: container?.status === 'running' ? 'running' : 'stopped',
            containerId: container?.name,
            updatedAt: now,
          })
          .where(eq(appServices.id, service.id))
      }
    }

    // Update deployment as successful
    await db
      .update(deployments)
      .set({
        status: 'running',
        gitCommit: commitInfo?.hash,
        gitMessage: commitInfo?.message,
        buildLogs: buildLogs.join('\n'),
        completedAt: new Date().toISOString(),
      })
      .where(eq(deployments.id, deploymentId))

    // Update app status
    await db
      .update(apps)
      .set({
        status: 'running',
        lastDeployedAt: now,
        lastDeployCommit: commitInfo?.hash,
        updatedAt: now,
      })
      .where(eq(apps.id, appId))

    onProgress?.({ stage: 'done', message: 'Deployment complete!' })

    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
    })

    return { success: true, deployment: deployment! }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    log.deploy.error('Deployment failed', { appId, error: errorMessage })

    // Update deployment as failed
    await db
      .update(deployments)
      .set({
        status: 'failed',
        buildLogs: buildLogs.join('\n'),
        errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(deployments.id, deploymentId))

    // Update app status
    await db
      .update(apps)
      .set({ status: 'failed', updatedAt: new Date().toISOString() })
      .where(eq(apps.id, appId))

    onProgress?.({ stage: 'failed', message: errorMessage })

    return { success: false, error: errorMessage }
  }
}

/**
 * Stop an app
 */
export async function stopApp(appId: string): Promise<{ success: boolean; error?: string }> {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  })

  if (!app) {
    return { success: false, error: 'App not found' }
  }

  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, app.repositoryId),
  })

  if (!repo) {
    return { success: false, error: 'Repository not found' }
  }

  const projectName = getProjectName(app.id)

  // Stop containers
  const downResult = await composeDown({
    projectName,
    cwd: repo.path,
    composeFile: app.composeFile,
  })

  if (!downResult.success) {
    return { success: false, error: downResult.error }
  }

  // Remove routes and DNS records
  const services = await db.query.appServices.findMany({
    where: eq(appServices.appId, appId),
  })

  for (const service of services) {
    if (service.exposed && service.domain) {
      // Remove Caddy route
      await removeRoute(service.domain)

      // Remove DNS record
      const [subdomain, ...domainParts] = service.domain.split('.')
      const domain = domainParts.join('.')
      if (domain) {
        await deleteDnsRecord(subdomain, domain)
      }

      // Update service status
      await db
        .update(appServices)
        .set({ status: 'stopped', containerId: null, updatedAt: new Date().toISOString() })
        .where(eq(appServices.id, service.id))
    }
  }

  // Update app status
  await db
    .update(apps)
    .set({ status: 'stopped', updatedAt: new Date().toISOString() })
    .where(eq(apps.id, appId))

  log.deploy.info('App stopped', { appId })
  return { success: true }
}

/**
 * Rollback to a previous deployment
 */
export async function rollbackApp(
  appId: string,
  targetDeploymentId: string,
  onProgress?: DeploymentProgressCallback
): Promise<{ success: boolean; deployment?: Deployment; error?: string }> {
  // For rollback, we basically just redeploy
  // A more sophisticated implementation would restore the exact git commit
  return deployApp(appId, { deployedBy: 'rollback' }, onProgress)
}

/**
 * Get deployment history for an app
 */
export async function getDeploymentHistory(appId: string): Promise<Deployment[]> {
  return db.query.deployments.findMany({
    where: eq(deployments.appId, appId),
    orderBy: (deployments, { desc }) => [desc(deployments.createdAt)],
  })
}
