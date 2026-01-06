import { spawn } from 'child_process'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apps, appServices, deployments, repositories, tunnels } from '../db/schema'
import { log } from '../lib/logger'
import { getSettings, getViboraDir } from '../lib/settings'
import { composeBuild } from './docker-compose'
import {
  ensureSwarmMode,
  generateSwarmComposeFile,
  stackDeploy,
  stackRemove,
  stackServices,
  waitForServicesHealthy,
  addCloudflaredToStack,
  validateAndAllocatePorts,
} from './docker-swarm'
import { createDnsRecord, createOriginCACertificate, deleteDnsRecord } from './cloudflare'
import {
  createTunnel,
  configureTunnelIngress,
  createTunnelCname,
  deleteTunnel,
  isTunnelAvailable,
  type TunnelIngress,
} from './cloudflare-tunnel'
import { detectTraefik, addRoute, removeRoute, type TraefikConfig, type AddRouteOptions } from './traefik'
import { startTraefikContainer, getViboraTraefikConfig, TRAEFIK_CERTS_MOUNT } from './traefik-docker'
import { sendNotification } from './notification-service'
import {
  registerDeployment,
  addProcess,
  cleanupDeployment,
  cancelDeploymentByAppId,
  getActiveDeploymentId,
} from './deployment-controller'
import type { Deployment } from '../db/schema'

// Re-export for API use
export { cancelDeploymentByAppId, getActiveDeploymentId }

// Cache detected Traefik config to avoid repeated detection
let cachedTraefikConfig: TraefikConfig | null = null

// Cache detected public IP to avoid repeated detection
let cachedPublicIp: string | null = null

/**
 * Deployment log broadcaster - enables multiple SSE connections to receive logs from a single deployment.
 * Buffers logs for late-joining subscribers and broadcasts progress to all connected clients.
 */
interface DeploymentLogState {
  logs: DeploymentProgress[]
  subscribers: Set<(progress: DeploymentProgress) => void>
  isComplete: boolean
  finalEvent?: DeploymentProgress
}

const deploymentLogStates = new Map<string, DeploymentLogState>()

function getOrCreateLogState(appId: string): DeploymentLogState {
  let state = deploymentLogStates.get(appId)
  if (!state) {
    state = {
      logs: [],
      subscribers: new Set(),
      isComplete: false,
    }
    deploymentLogStates.set(appId, state)
  }
  return state
}

/**
 * Broadcast a progress event to all subscribers for an app.
 * Also buffers the log for late-joining subscribers.
 */
export function broadcastProgress(appId: string, progress: DeploymentProgress): void {
  const state = getOrCreateLogState(appId)
  state.logs.push(progress)

  // Mark as complete if done/failed/cancelled
  if (progress.stage === 'done' || progress.stage === 'failed' || progress.stage === 'cancelled') {
    state.isComplete = true
    state.finalEvent = progress
  }

  // Broadcast to all subscribers
  for (const subscriber of state.subscribers) {
    try {
      subscriber(progress)
    } catch {
      // Subscriber disconnected, will be cleaned up
    }
  }
}

/**
 * Subscribe to deployment logs for an app.
 * Immediately receives all buffered logs, then receives live updates.
 * Returns unsubscribe function.
 */
export function subscribeToDeploymentLogs(
  appId: string,
  onProgress: (progress: DeploymentProgress) => void
): { unsubscribe: () => void; isComplete: boolean; finalEvent?: DeploymentProgress } {
  const state = getOrCreateLogState(appId)

  // Send all buffered logs immediately
  for (const progress of state.logs) {
    try {
      onProgress(progress)
    } catch {
      // Ignore errors during replay
    }
  }

  // Add subscriber for future updates
  state.subscribers.add(onProgress)

  return {
    unsubscribe: () => {
      state.subscribers.delete(onProgress)
    },
    isComplete: state.isComplete,
    finalEvent: state.finalEvent,
  }
}

/**
 * Check if there's an active deployment for an app
 */
export function hasActiveDeploymentLogs(appId: string): boolean {
  const state = deploymentLogStates.get(appId)
  return !!state && !state.isComplete
}

/**
 * Clean up deployment logs for an app (call when deployment is no longer needed)
 */
export function clearDeploymentLogs(appId: string): void {
  deploymentLogStates.delete(appId)
}

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
  stage: 'pulling' | 'building' | 'starting' | 'configuring' | 'done' | 'failed' | 'cancelled'
  message: string
  progress?: number
}

export type DeploymentProgressCallback = (progress: DeploymentProgress) => void

/**
 * Get the project name for docker compose (used for container naming)
 * Docker compose project names must be lowercase alphanumeric, hyphens, underscores
 */
export function getProjectName(appId: string, repoName?: string): string {
  const suffix = appId.slice(0, 8).toLowerCase()
  if (repoName) {
    // Sanitize repo name for Docker: lowercase, alphanumeric + hyphens only, max 20 chars
    const sanitized = repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
      .replace(/-$/, '') // Remove trailing hyphen if truncation created one
    return `vibora-${sanitized}-${suffix}`
  }
  return `vibora-${suffix}`
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
): Promise<{ success: boolean; deployment?: Deployment; error?: string; cancelled?: boolean }> {
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

  // Register deployment for cancellation tracking
  const abortController = registerDeployment(deploymentId, appId)
  const signal = abortController.signal

  // Helper to check if cancelled
  const checkCancelled = () => {
    if (signal.aborted) {
      throw new Error('DEPLOYMENT_CANCELLED')
    }
  }

  // Update app status
  await db.update(apps).set({ status: 'building', updatedAt: now }).where(eq(apps.id, appId))

  const projectName = getProjectName(app.id, repo.displayName)
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
    // Stage 0: Validate ports are available (host mode requires unique ports)
    onProgress?.({ stage: 'building', message: 'Checking port availability...' })
    const autoAllocatePorts = app.autoPortAllocation ?? true
    const portValidation = await validateAndAllocatePorts(
      repo.path,
      app.composeFile,
      env ?? {},
      autoAllocatePorts
    )

    if (!portValidation.valid) {
      const conflictMsg = portValidation.conflicts
        .map((c) => `Port ${c.requestedPort} (service: ${c.serviceName}${c.envVar ? `, env: ${c.envVar}` : ''})`)
        .join(', ')
      throw new Error(`Port conflict: ${conflictMsg} already in use. Configure a different PORT in environment variables.`)
    }

    // If ports were auto-allocated, update the env vars
    if (portValidation.allocations && portValidation.allocations.size > 0) {
      env = env ?? {}
      for (const [envVar, port] of portValidation.allocations) {
        env[envVar] = String(port)
        onProgress?.({ stage: 'building', message: `Auto-allocated ${envVar}=${port} (original port was in use)` })
      }

      // Update the app's stored environment variables
      await db.update(apps).set({
        environmentVariables: JSON.stringify(env),
        updatedAt: new Date().toISOString(),
      }).where(eq(apps.id, appId))

      log.deploy.info('Updated app environment variables with auto-allocated ports', {
        appId,
        allocations: Object.fromEntries(portValidation.allocations),
      })
    }

    // Stage 1: Ensure Swarm mode is active
    const swarmResult = await ensureSwarmMode()
    if (!swarmResult.initialized) {
      throw new Error(`Docker Swarm initialization failed: ${swarmResult.error}`)
    }

    // Detect or start Traefik for routing
    const traefikConfig = await ensureTraefik()

    // Get commit info
    const commitInfo = await getGitCommit(repo.path)

    // Stage 2: Build containers
    checkCancelled()
    onProgress?.({ stage: 'building', message: 'Building containers...' })

    const buildResult = await composeBuild(
      {
        projectName,
        cwd: repo.path,
        composeFile: app.composeFile,
        env,
        noCache: app.noCacheBuild ?? false,
        signal,
        onProcess: (proc) => addProcess(deploymentId, proc),
      },
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'building', message: line })
      }
    )

    if (buildResult.aborted) {
      throw new Error('DEPLOYMENT_CANCELLED')
    }

    if (!buildResult.success) {
      throw new Error(`Build failed: ${buildResult.error}`)
    }

    // Stage 2b: Generate Swarm-compatible compose file
    // This adds image fields for services with build sections
    // Also attaches services to the Traefik network for routing
    const appDir = join(getViboraDir(), 'apps', appId)
    const swarmFileResult = await generateSwarmComposeFile(
      repo.path,
      app.composeFile,
      projectName,
      traefikConfig.network, // Attach to Traefik network
      appDir, // Output directory for swarm compose file
      env // Environment variables for port expansion
    )
    if (!swarmFileResult.success) {
      throw new Error(`Failed to generate Swarm compose file: ${swarmFileResult.error}`)
    }

    // Stage 3: Deploy stack
    checkCancelled()
    onProgress?.({ stage: 'starting', message: 'Deploying stack...' })

    const deployResult = await stackDeploy(
      {
        stackName: projectName,
        cwd: repo.path,
        composeFile: swarmFileResult.swarmFile, // Use the generated Swarm-compatible file
        env,
        signal,
        onProcess: (proc) => addProcess(deploymentId, proc),
      },
      (line) => {
        buildLogs.push(line)
        onProgress?.({ stage: 'starting', message: line })
      }
    )

    if (deployResult.aborted) {
      throw new Error('DEPLOYMENT_CANCELLED')
    }

    if (!deployResult.success) {
      throw new Error(`Failed to deploy stack: ${deployResult.error}`)
    }

    // Wait for services to be healthy
    checkCancelled()
    onProgress?.({ stage: 'starting', message: 'Waiting for services to be healthy...' })

    const healthResult = await waitForServicesHealthy(projectName, 120000, signal) // 2 minute timeout
    if (healthResult.aborted) {
      throw new Error('DEPLOYMENT_CANCELLED')
    }
    if (!healthResult.healthy) {
      log.deploy.warn('Some services did not become healthy', {
        stackName: projectName,
        failedServices: healthResult.failedServices,
      })
      // Don't fail the deployment - services may still start
    }

    // Stage 4: Configure routing (DNS/Tunnel + Traefik)
    checkCancelled()
    onProgress?.({ stage: 'configuring', message: 'Configuring routing...' })

    const settings = getSettings()
    const serverPublicIp = await detectPublicIp()
    const services = await db.query.appServices.findMany({
      where: eq(appServices.appId, appId),
    })

    // Validate: exposed services with domains must have a valid container port
    for (const service of services) {
      if (service.exposed && service.domain) {
        if (!service.containerPort) {
          throw new Error(
            `Service "${service.serviceName}" is exposed with domain "${service.domain}" but has no container port configured. ` +
            `Add a port mapping to your compose file or configure the container port in the service settings.`
          )
        }
        if (service.containerPort <= 0 || service.containerPort > 65535) {
          throw new Error(
            `Service "${service.serviceName}" has invalid container port ${service.containerPort}. ` +
            `Port must be between 1 and 65535. Check your compose file port configuration.`
          )
        }
      }
    }

    // Get service status
    const serviceStatuses = await stackServices(projectName)

    // Separate services by exposure method
    const exposedServices = services.filter((s) => s.exposed && s.domain && s.containerPort)
    const dnsServices = exposedServices.filter((s) => s.exposureMethod !== 'tunnel')
    const tunnelServices = exposedServices.filter((s) => s.exposureMethod === 'tunnel')

    // Handle DNS-based services (existing flow: Traefik + DNS A record)
    for (const service of dnsServices) {
      // Find the swarm service for this app service
      const swarmService = serviceStatuses.find((s) => s.serviceName === service.serviceName)

      // Extract root domain for certificate (e.g., vibora.dev from api.vibora.dev)
      const [subdomain, ...domainParts] = service.domain!.split('.')
      const rootDomain = domainParts.join('.')

      // Configure Traefik reverse proxy
      // Upstream URL uses Docker service DNS: http://stackName_serviceName:port
      const upstreamUrl = `http://${projectName}_${service.serviceName}:${service.containerPort}`

      // Try to generate Origin CA certificate if Cloudflare is configured
      const routeOptions: AddRouteOptions = { appName: app.name }
      if (settings.integrations.cloudflareApiToken && rootDomain) {
        onProgress?.({ stage: 'configuring', message: `Generating SSL certificate for ${rootDomain}...` })

        const certResult = await createOriginCACertificate(rootDomain)
        if (certResult.success && certResult.certPath && certResult.keyPath) {
          // Use file-based TLS with paths inside the container
          routeOptions.tlsCert = {
            certFile: `${TRAEFIK_CERTS_MOUNT}/${rootDomain}/cert.pem`,
            keyFile: `${TRAEFIK_CERTS_MOUNT}/${rootDomain}/key.pem`,
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

      const traefikResult = await addRoute(traefikConfig, appId, service.domain!, upstreamUrl, routeOptions)
      if (!traefikResult.success) {
        log.deploy.warn('Failed to configure Traefik route', {
          service: service.serviceName,
          error: traefikResult.error,
        })
      }

      // Configure Cloudflare DNS
      if (rootDomain) {
        if (settings.integrations.cloudflareApiToken) {
          // Cloudflare is configured - DNS creation is required
          if (!serverPublicIp) {
            throw new Error(`Failed to detect server public IP for DNS record creation (${service.domain})`)
          }
          onProgress?.({ stage: 'configuring', message: `Creating DNS record for ${service.domain}...` })
          const dnsResult = await createDnsRecord(
            subdomain,
            rootDomain,
            serverPublicIp
          )
          if (!dnsResult.success) {
            throw new Error(`Failed to create DNS record for ${service.domain}: ${dnsResult.error}`)
          }
          buildLogs.push(`✓ DNS record created: ${service.domain} → ${serverPublicIp}`)
        } else {
          // No Cloudflare token - warn user to configure DNS manually
          const dnsWarning = `⚠️ DNS not configured automatically for ${service.domain}. ` +
            (serverPublicIp
              ? `Create an A record pointing to ${serverPublicIp}`
              : 'Configure Cloudflare API token in settings or create DNS records manually.')
          buildLogs.push(dnsWarning)
          onProgress?.({ stage: 'configuring', message: dnsWarning })
          log.deploy.warn('DNS not configured - manual setup required', {
            domain: service.domain,
            hasPublicIp: !!serverPublicIp,
          })
        }
      }

      // Update service status
      const [current, desired] = (swarmService?.replicas || '0/0').split('/').map(Number)
      const isRunning = !isNaN(current) && !isNaN(desired) && current > 0 && current === desired

      await db
        .update(appServices)
        .set({
          status: isRunning ? 'running' : 'stopped',
          containerId: swarmService?.name,
          updatedAt: now,
        })
        .where(eq(appServices.id, service.id))
    }

    // Handle Tunnel-based services (new flow: Cloudflare Tunnel)
    if (tunnelServices.length > 0) {
      if (!isTunnelAvailable()) {
        throw new Error(
          'Cloudflare Tunnel is not configured. Please add your Cloudflare Account ID in settings to use tunnel exposure.'
        )
      }

      onProgress?.({ stage: 'configuring', message: 'Setting up Cloudflare Tunnel...' })

      // Check if app already has a tunnel
      let tunnelRecord = await db.query.tunnels.findFirst({
        where: eq(tunnels.appId, appId),
      })

      if (!tunnelRecord) {
        // Create new tunnel for this app
        const tunnelName = `vibora-${projectName}`
        const tunnelResult = await createTunnel(tunnelName)

        if (!tunnelResult.success) {
          throw new Error(`Failed to create Cloudflare Tunnel: ${tunnelResult.error}`)
        }

        // Save tunnel to database
        const tunnelId = nanoid()
        await db.insert(tunnels).values({
          id: tunnelId,
          appId,
          tunnelId: tunnelResult.tunnel!.tunnelId,
          tunnelName: tunnelResult.tunnel!.tunnelName,
          tunnelToken: tunnelResult.tunnel!.tunnelToken,
          status: 'inactive',
          createdAt: now,
          updatedAt: now,
        })

        tunnelRecord = await db.query.tunnels.findFirst({
          where: eq(tunnels.id, tunnelId),
        })

        buildLogs.push(`✓ Created Cloudflare Tunnel: ${tunnelName}`)
        log.deploy.info('Created Cloudflare Tunnel', { tunnelId: tunnelResult.tunnel!.tunnelId, name: tunnelName })
      }

      // Build ingress rules for all tunnel services
      const ingress: TunnelIngress[] = tunnelServices.map((service) => ({
        hostname: service.domain!,
        service: `http://${projectName}_${service.serviceName}:${service.containerPort}`,
      }))

      // Configure tunnel ingress
      onProgress?.({ stage: 'configuring', message: 'Configuring tunnel ingress rules...' })
      const ingressResult = await configureTunnelIngress(tunnelRecord!.tunnelId, ingress)
      if (!ingressResult.success) {
        throw new Error(`Failed to configure tunnel ingress: ${ingressResult.error}`)
      }
      buildLogs.push(`✓ Configured ${ingress.length} tunnel ingress rule(s)`)

      // Create CNAME records for each tunnel service
      for (const service of tunnelServices) {
        const [subdomain, ...domainParts] = service.domain!.split('.')
        const rootDomain = domainParts.join('.')

        if (rootDomain) {
          onProgress?.({ stage: 'configuring', message: `Creating tunnel CNAME for ${service.domain}...` })
          const cnameResult = await createTunnelCname(subdomain, rootDomain, tunnelRecord!.tunnelId)
          if (!cnameResult.success) {
            buildLogs.push(`⚠️ Failed to create CNAME for ${service.domain}: ${cnameResult.error}`)
            log.deploy.warn('Failed to create tunnel CNAME', { domain: service.domain, error: cnameResult.error })
          } else {
            buildLogs.push(`✓ Tunnel CNAME created: ${service.domain}`)
          }
        }

        // Update service status
        const swarmService = serviceStatuses.find((s) => s.serviceName === service.serviceName)
        const [current, desired] = (swarmService?.replicas || '0/0').split('/').map(Number)
        const isRunning = !isNaN(current) && !isNaN(desired) && current > 0 && current === desired

        await db
          .update(appServices)
          .set({
            status: isRunning ? 'running' : 'stopped',
            containerId: swarmService?.name,
            updatedAt: now,
          })
          .where(eq(appServices.id, service.id))
      }

      // Add cloudflared service to the stack and redeploy
      onProgress?.({ stage: 'configuring', message: 'Adding cloudflared to stack...' })
      const cloudflaredResult = await addCloudflaredToStack(
        swarmFileResult.swarmFile, // Absolute path to swarm compose file
        {
          tunnelToken: tunnelRecord!.tunnelToken,
          network: traefikConfig.network,
        }
      )

      if (!cloudflaredResult.success) {
        throw new Error(`Failed to add cloudflared to stack: ${cloudflaredResult.error}`)
      }

      // Redeploy stack with cloudflared service
      const redeployResult = await stackDeploy(
        {
          stackName: projectName,
          cwd: repo.path,
          composeFile: swarmFileResult.swarmFile,
          env,
          signal,
          onProcess: (proc) => addProcess(deploymentId, proc),
        },
        (line) => buildLogs.push(line)
      )

      if (!redeployResult.success) {
        throw new Error(`Failed to redeploy with cloudflared: ${redeployResult.error}`)
      }

      // Update tunnel status
      await db
        .update(tunnels)
        .set({ status: 'active', updatedAt: now })
        .where(eq(tunnels.id, tunnelRecord!.id))

      buildLogs.push('✓ Cloudflare Tunnel activated')
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

    // Clean up deployment tracking
    cleanupDeployment(deploymentId)

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
    const isCancelled = errorMessage === 'DEPLOYMENT_CANCELLED'

    // Clean up deployment tracking
    cleanupDeployment(deploymentId)

    if (isCancelled) {
      log.deploy.info('Deployment cancelled', { appId, deploymentId })

      // Update deployment as cancelled
      await db
        .update(deployments)
        .set({
          status: 'cancelled',
          buildLogs: buildLogs.join('\n'),
          errorMessage: 'Deployment cancelled by user',
          completedAt: new Date().toISOString(),
        })
        .where(eq(deployments.id, deploymentId))

      // Update app status back to stopped (not failed)
      await db
        .update(apps)
        .set({ status: 'stopped', updatedAt: new Date().toISOString() })
        .where(eq(apps.id, appId))

      // Try to clean up any partially deployed stack
      const projectName = getProjectName(appId, repo.displayName)
      stackRemove(projectName).catch(() => {
        // Ignore errors during cleanup
      })

      onProgress?.({ stage: 'cancelled', message: 'Deployment cancelled' })
      return { success: false, error: 'Deployment cancelled', cancelled: true }
    }

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
 * Note: DNS records are preserved so traffic routes correctly on redeploy.
 * DNS cleanup happens on domain change or app deletion.
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

  const projectName = getProjectName(app.id, repo.displayName)

  // Remove stack
  const removeResult = await stackRemove(projectName)

  if (!removeResult.success) {
    return { success: false, error: removeResult.error }
  }

  // Remove Traefik routes and DNS records
  const services = await db.query.appServices.findMany({
    where: eq(appServices.appId, appId),
  })

  const traefikConfig = await getTraefikConfig()

  for (const service of services) {
    if (service.exposed && service.domain) {
      // Remove Traefik route
      if (traefikConfig) {
        await removeRoute(traefikConfig, appId, app.name)
      }

      // Delete DNS record (both A records and CNAMEs use same function)
      const [subdomain, ...domainParts] = service.domain.split('.')
      const rootDomain = domainParts.join('.')
      if (rootDomain) {
        deleteDnsRecord(subdomain, rootDomain).catch((err) => {
          log.deploy.warn('Failed to delete DNS record during app stop', {
            domain: service.domain,
            error: String(err),
          })
        })
      }

      // Update service status
      await db
        .update(appServices)
        .set({ status: 'stopped', containerId: null, updatedAt: new Date().toISOString() })
        .where(eq(appServices.id, service.id))
    }
  }

  // Delete tunnel if exists
  const tunnel = await db.query.tunnels.findFirst({
    where: eq(tunnels.appId, appId),
  })
  if (tunnel) {
    try {
      await deleteTunnel(tunnel.tunnelId)
      log.deploy.info('Deleted Cloudflare tunnel', { tunnelId: tunnel.tunnelId, appId })
    } catch (err) {
      log.deploy.warn('Failed to delete Cloudflare tunnel', {
        tunnelId: tunnel.tunnelId,
        appId,
        error: String(err),
      })
    }
    await db.delete(tunnels).where(eq(tunnels.appId, appId))
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
