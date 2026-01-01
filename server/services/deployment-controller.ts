import type { ChildProcess } from 'child_process'
import { log } from '../lib/logger'

interface ActiveDeployment {
  appId: string
  abortController: AbortController
  processes: ChildProcess[]
}

// Track active deployments by deployment ID
const activeDeployments = new Map<string, ActiveDeployment>()

// Track deployment ID by app ID for lookup
const appToDeployment = new Map<string, string>()

/**
 * Register a new deployment and get an AbortController for it
 */
export function registerDeployment(deploymentId: string, appId: string): AbortController {
  // Cancel any existing deployment for this app
  const existingDeploymentId = appToDeployment.get(appId)
  if (existingDeploymentId) {
    log.deploy.warn('Cancelling previous deployment for app', { appId, existingDeploymentId })
    cancelDeployment(existingDeploymentId)
  }

  const abortController = new AbortController()
  activeDeployments.set(deploymentId, {
    appId,
    abortController,
    processes: [],
  })
  appToDeployment.set(appId, deploymentId)

  log.deploy.debug('Registered deployment', { deploymentId, appId })
  return abortController
}

/**
 * Add a child process to track for a deployment
 */
export function addProcess(deploymentId: string, proc: ChildProcess): void {
  const deployment = activeDeployments.get(deploymentId)
  if (deployment) {
    deployment.processes.push(proc)
    log.deploy.debug('Added process to deployment', { deploymentId, pid: proc.pid })
  }
}

/**
 * Get the active deployment ID for an app
 */
export function getActiveDeploymentId(appId: string): string | undefined {
  return appToDeployment.get(appId)
}

/**
 * Check if a deployment is active
 */
export function isDeploymentActive(deploymentId: string): boolean {
  return activeDeployments.has(deploymentId)
}

/**
 * Cancel a deployment by killing all its processes
 */
export async function cancelDeployment(deploymentId: string): Promise<boolean> {
  const deployment = activeDeployments.get(deploymentId)
  if (!deployment) {
    log.deploy.warn('Cannot cancel - deployment not found', { deploymentId })
    return false
  }

  log.deploy.info('Cancelling deployment', { deploymentId, appId: deployment.appId })

  // Signal abort to all async operations
  deployment.abortController.abort()

  // Kill all tracked processes
  for (const proc of deployment.processes) {
    if (proc.pid && !proc.killed) {
      log.deploy.debug('Killing process', { deploymentId, pid: proc.pid })
      try {
        // Try graceful shutdown first
        proc.kill('SIGTERM')

        // Give it 3 seconds then force kill
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!proc.killed) {
              log.deploy.debug('Force killing process', { deploymentId, pid: proc.pid })
              proc.kill('SIGKILL')
            }
            resolve()
          }, 3000)

          proc.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
      } catch (err) {
        log.deploy.warn('Error killing process', { deploymentId, pid: proc.pid, error: String(err) })
      }
    }
  }

  // Cleanup tracking
  cleanupDeployment(deploymentId)

  log.deploy.info('Deployment cancelled', { deploymentId })
  return true
}

/**
 * Cancel deployment by app ID
 */
export async function cancelDeploymentByAppId(appId: string): Promise<boolean> {
  const deploymentId = appToDeployment.get(appId)
  if (!deploymentId) {
    log.deploy.warn('Cannot cancel - no active deployment for app', { appId })
    return false
  }
  return cancelDeployment(deploymentId)
}

/**
 * Clean up deployment tracking (call when deployment completes normally)
 */
export function cleanupDeployment(deploymentId: string): void {
  const deployment = activeDeployments.get(deploymentId)
  if (deployment) {
    appToDeployment.delete(deployment.appId)
    activeDeployments.delete(deploymentId)
    log.deploy.debug('Cleaned up deployment tracking', { deploymentId })
  }
}
