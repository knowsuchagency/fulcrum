import { spawn } from 'child_process'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apps, appServices, deployments, repositories } from '../db/schema'
import { log } from '../lib/logger'
import { getSettings } from '../lib/settings'
import { composeBuild } from './docker-compose'
import {
  ensureSwarmMode,
  generateSwarmComposeFile,
  stackDeploy,
  stackRemove,
  stackServices,
  waitForServicesHealthy,
} from './docker-swarm'
import { createDnsRecord, deleteDnsRecord, createOriginCACertificate } from './cloudflare'
import { detectTraefik, addRoute, removeRoute, type TraefikConfig, type AddRouteOptions } from './traefik'
import { startTraefikContainer, getViboraTraefikConfig, TRAEFIK_CERTS_MOUNT } from './traefik-docker'
import { sendNotification } from './notification-service'
import type { Deployment } from '../db/schema'

// Cache detected Traefik config to avoid repeated detection
let cachedTraefikConfig: TraefikConfig | null = null

// Cache detected public IP to avoid repeated detection
let cachedPublicIp: string | null = null

/**
 * Detect the server's public IP address
 */
async function detectPublicIp(): Promise<string | null> {
  if (cachedPublicIp) return cachedPublicIp

  const services = [
    'https://api.ipify.org',
    'https://icanhazip.com',
    'https://ifconfig.me/ip',
    'https://checkip.amazonaws.com',
  ]

  for (const service of services) {
    try {
      const response = await fetch(service, { signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        const ip = (await response.text()).trim()
        // Basic IPv4 validation
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          cachedPublicIp = ip
          return ip
        }
      }
    } catch {
      // Try next service
    }
  }

  return null
}

/**
 * Get or detect Traefik configuration
 * Returns cached config if available, otherwise detects and caches
 */
async function getTraefikConfig(): Promise<TraefikConfig | null> {
  if (cachedTraefikConfig) {
    return cachedTraefikConfig
  }

  const detected = await detectTraefik()
  if (detected) {
    cachedTraefikConfig = detected
    return detected
  }

  return null
}

/**
 * Ensure Traefik is available (detect existing or start Vibora's)
 */
async function ensureTraefik(): Promise<TraefikConfig> {
  // First try to detect existing Traefik
  let config = await getTraefikConfig()
  if (config) {
    return config
  }

  // No Traefik found, start Vibora's
  log.deploy.info('No Traefik detected, starting Vibora Traefik')

  const result = await startTraefikContainer('admin@localhost')
  if (!result.success) {
    throw new Error(`Failed to start Traefik: ${result.error}`)
  }

  config = getViboraTraefikConfig()
  cachedTraefikConfig = config
  return config
}

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

  // Skip if already deploying
  if (app.status === 'building') {
    log.deploy.info('Skipping deployment - already building', { appId })
    return { success: false, error: 'Deployment already in progress' }
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
    // Stage 0: Ensure Swarm mode is active
    const swarmResult = await ensureSwarmMode()
    if (!swarmResult.initialized) {
      throw new Error(`Docker Swarm initialization failed: ${swarmResult.error}`)
    }

    // Detect or start Traefik for routing
    const traefikConfig = await ensureTraefik()

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
        noCache: app.noCacheBuild ?? false,
      },
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'building', message: line })
      }
    )

    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`)
    }

    // Stage 2b: Generate Swarm-compatible compose file
    // This adds image fields for services with build sections
    // Also attaches services to the Traefik network for routing
    const swarmFileResult = await generateSwarmComposeFile(
      repo.path,
      app.composeFile,
      projectName,
      traefikConfig.network // Attach to Traefik network
    )
    if (!swarmFileResult.success) {
      throw new Error(`Failed to generate Swarm compose file: ${swarmFileResult.error}`)
    }

    // Stage 3: Deploy stack
    onProgress?.({ stage: 'starting', message: 'Deploying stack...' })

    const deployResult = await stackDeploy(
      {
        stackName: projectName,
        cwd: repo.path,
        composeFile: swarmFileResult.swarmFile, // Use the generated Swarm-compatible file
        env,
      },
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'starting', message: line })
      }
    )

    if (!deployResult.success) {
      throw new Error(`Failed to deploy stack: ${deployResult.error}`)
    }

    // Wait for services to be healthy
    onProgress?.({ stage: 'starting', message: 'Waiting for services to be healthy...' })

    const healthResult = await waitForServicesHealthy(projectName, 120000) // 2 minute timeout
    if (!healthResult.healthy) {
      log.deploy.warn('Some services did not become healthy', {
        stackName: projectName,
        failedServices: healthResult.failedServices,
      })
      // Don't fail the deployment - services may still start
    }

    // Stage 4: Configure routing (DNS + Traefik)
    onProgress?.({ stage: 'configuring', message: 'Configuring DNS and proxy...' })

    const settings = getSettings()
    const serverPublicIp = await detectPublicIp()
    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, appId),
    })

    // Get service status
    const serviceStatuses = await stackServices(projectName)

    for (const service of services) {
      if (service.exposed && service.domain && service.containerPort) {
        // Find the swarm service for this app service
        const swarmService = serviceStatuses.find((s) => s.serviceName === service.serviceName)

        // Extract root domain for certificate (e.g., vibora.dev from api.vibora.dev)
        const [subdomain, ...domainParts] = service.domain.split('.')
        const rootDomain = domainParts.join('.')

        // Configure Traefik reverse proxy
        // Upstream URL uses Docker service DNS: http://stackName_serviceName:port
        const upstreamUrl = `http://${projectName}_${service.serviceName}:${service.containerPort}`

        // Try to generate Origin CA certificate if Cloudflare is configured
        let routeOptions: AddRouteOptions | undefined
        if (settings.integrations.cloudflareApiToken && rootDomain) {
          onProgress?.({ stage: 'configuring', message: `Generating SSL certificate for ${rootDomain}...` })

          const certResult = await createOriginCACertificate(rootDomain)
          if (certResult.success && certResult.certPath && certResult.keyPath) {
            // Use file-based TLS with paths inside the container
            routeOptions = {
              tlsCert: {
                certFile: `${TRAEFIK_CERTS_MOUNT}/${rootDomain}/cert.pem`,
                keyFile: `${TRAEFIK_CERTS_MOUNT}/${rootDomain}/key.pem`,
              },
            }
            log.deploy.info('Using Origin CA certificate for TLS', {
              domain: service.domain,
              rootDomain,
            })
          } else if (certResult.permissionError) {
            // Log the permission error prominently but continue with ACME fallback
            log.deploy.warn('Origin CA certificate failed - missing permissions', {
              domain: rootDomain,
              error: certResult.error,
            })
            buildLogs.push(`⚠️ SSL Certificate: ${certResult.error}`)
            onProgress?.({ stage: 'configuring', message: `SSL cert generation failed (using fallback): ${certResult.error?.split('\n')[0]}` })
          } else if (certResult.error) {
            log.deploy.warn('Origin CA certificate failed', {
              domain: rootDomain,
              error: certResult.error,
            })
          }
        }

        const traefikResult = await addRoute(traefikConfig, appId, service.domain, upstreamUrl, routeOptions)
        if (!traefikResult.success) {
          log.deploy.warn('Failed to configure Traefik route', {
            service: service.serviceName,
            error: traefikResult.error,
          })
        }

        // Configure Cloudflare DNS
        if (settings.integrations.cloudflareApiToken && serverPublicIp && rootDomain) {
          const dnsResult = await createDnsRecord(
            subdomain,
            rootDomain,
            serverPublicIp
          )
          if (!dnsResult.success) {
            log.deploy.warn('Failed to create DNS record', {
              domain: service.domain,
              error: dnsResult.error,
            })
          }
        }

        // Update service status
        // Parse replicas "1/1" to determine if running
        const [current, desired] = (swarmService?.replicas || '0/0').split('/').map(Number)
        const isRunning = !isNaN(current) && !isNaN(desired) && current > 0 && current === desired

        await db
          .update(appServices)
          .set({
            status: isRunning ? 'running' : 'stopped',
            containerId: swarmService?.name, // Use swarm service name
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

    // Send success notification if enabled for this app
    if (app.notificationsEnabled !== false) {
      sendNotification({
        title: 'Deployment Complete',
        message: `${app.name} has been deployed successfully`,
        appId: app.id,
        appName: app.name,
        type: 'deployment_success',
      })
    }

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

    // Send failure notification if enabled for this app
    if (app.notificationsEnabled !== false) {
      sendNotification({
        title: 'Deployment Failed',
        message: `${app.name} deployment failed: ${errorMessage.slice(0, 100)}`,
        appId: app.id,
        appName: app.name,
        type: 'deployment_failed',
      })
    }

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

  // Remove stack
  const removeResult = await stackRemove(projectName)

  if (!removeResult.success) {
    return { success: false, error: removeResult.error }
  }

  // Remove routes and DNS records
  const services = await db.query.appServices.findMany({
    where: eq(appServices.appId, appId),
  })

  // Get Traefik config for route removal
  const traefikConfig = await getTraefikConfig()

  for (const service of services) {
    if (service.exposed && service.domain) {
      // Remove Traefik route
      if (traefikConfig) {
        await removeRoute(traefikConfig, appId)
      }

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
