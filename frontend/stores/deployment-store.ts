import { types, getEnv } from 'mobx-state-tree'
import type { Instance } from 'mobx-state-tree'
import { API_BASE } from '@/hooks/use-apps'
import type { Logger } from '../../shared/logger'

// Deployment stages from backend
export type DeploymentStage =
  | 'pulling'
  | 'building'
  | 'starting'
  | 'configuring'
  | 'done'
  | 'failed'
  | 'cancelled'

export interface DeploymentProgress {
  stage: DeploymentStage
  message: string
}

export interface Deployment {
  id: string
  appId: string
  status: string
  startedAt: string
  completedAt?: string
  buildLog?: string
}

/**
 * Environment injected into the store.
 */
export interface DeploymentStoreEnv {
  /** Logger instance */
  log: Logger
  /** Query client invalidation callback */
  invalidateQueries: (appId: string) => void
}

/**
 * Deployment Stream Store
 *
 * Manages SSE connection for real-time deployment logs.
 * Uses MST for predictable state management and logging.
 */
export const DeploymentStreamStore = types
  .model('DeploymentStreamStore', {
    /** Currently deploying app ID */
    appId: types.maybeNull(types.string),
    /** Whether deployment is in progress */
    isDeploying: types.optional(types.boolean, false),
    /** Deployment logs */
    logs: types.array(types.string),
    /** Current deployment stage */
    stage: types.maybeNull(types.string),
    /** Error message if deployment failed */
    error: types.maybeNull(types.string),
  })
  .volatile(() => ({
    /** EventSource connection (non-serializable) */
    eventSource: null as EventSource | null,
    /** Completed deployment data */
    deployment: null as Deployment | null,
  }))
  .views((self) => ({
    /** Get typed stage */
    get typedStage(): DeploymentStage | null {
      return self.stage as DeploymentStage | null
    },
    /** Whether there are logs to show */
    get hasLogs(): boolean {
      return self.logs.length > 0
    },
    /** Get log count - useful for debugging observer reactivity */
    get logCount(): number {
      return self.logs.length
    },
    /** Get all logs as a plain array - this is a computed view that observer can track */
    get logsSnapshot(): string[] {
      // Access each element to ensure observer tracks array contents
      return self.logs.slice()
    },
    /** Whether deployment completed (successfully or with error) */
    get isComplete(): boolean {
      return !self.isDeploying && (self.stage === 'done' || self.stage === 'failed' || self.stage === 'cancelled' || !!self.error)
    },
  }))
  .actions((self) => {
    const getLog = () => getEnv<DeploymentStoreEnv>(self).log
    const getInvalidateQueries = () => getEnv<DeploymentStoreEnv>(self).invalidateQueries

    return {
      // Internal actions for EventSource callbacks (must be actions to modify state)
      _handleProgress(progress: DeploymentProgress) {
        const log = getLog()
        log.debug('Deployment progress', { appId: self.appId, stage: progress.stage, message: progress.message.slice(0, 100) })
        self.stage = progress.stage
        self.logs.push(progress.message)
      },

      _handleComplete(result: { success: boolean; deployment: Deployment }) {
        const log = getLog()
        const appId = self.appId
        log.info('Deployment complete', { appId, success: result.success, deploymentId: result.deployment?.id })
        self.deployment = result.deployment
        self.isDeploying = false
        self.stage = 'done'
        if (self.eventSource) {
          self.eventSource.close()
          self.eventSource = null
        }
        if (appId) {
          getInvalidateQueries()(appId)
        }
      },

      _handleError(errorMsg: string) {
        const log = getLog()
        const appId = self.appId
        log.error('Deployment failed', { appId, error: errorMsg })
        self.error = errorMsg
        self.stage = 'failed'
        self.isDeploying = false
        if (self.eventSource) {
          self.eventSource.close()
          self.eventSource = null
        }
        if (appId) {
          getInvalidateQueries()(appId)
        }
      },

      _handleConnectionLost() {
        const log = getLog()
        // Only handle if we're still deploying (not already handled by error event)
        if (self.isDeploying) {
          log.error('EventSource connection lost', { appId: self.appId })
          self.error = 'Connection lost during deployment'
          self.isDeploying = false
          self.stage = 'failed'
        }
        if (self.eventSource) {
          self.eventSource.close()
          self.eventSource = null
        }
      },

      /**
       * Start deployment and connect to SSE stream
       */
      deploy(appId: string) {
        const log = getLog()

        // Close any existing connection
        if (self.eventSource) {
          log.debug('Closing existing EventSource before new deploy', { appId: self.appId })
          self.eventSource.close()
          self.eventSource = null
        }

        // Reset state
        log.info('Starting deployment', { appId })
        self.appId = appId
        self.isDeploying = true
        self.logs.clear()
        self.stage = null
        self.error = null
        self.deployment = null

        // Create EventSource for SSE
        const eventSource = new EventSource(`${API_BASE}/api/apps/${appId}/deploy/stream`)
        self.eventSource = eventSource

        // Store reference to actions for callbacks
        const store = self as IDeploymentStreamStore

        eventSource.addEventListener('progress', (e) => {
          try {
            const progress = JSON.parse(e.data) as DeploymentProgress
            store._handleProgress(progress)
          } catch (err) {
            log.warn('Failed to parse progress event', { error: String(err) })
          }
        })

        eventSource.addEventListener('complete', (e) => {
          try {
            const result = JSON.parse(e.data) as { success: boolean; deployment: Deployment }
            store._handleComplete(result)
          } catch (err) {
            log.warn('Failed to parse complete event', { error: String(err) })
          }
        })

        eventSource.addEventListener('error', (e) => {
          if (e instanceof MessageEvent) {
            try {
              const result = JSON.parse(e.data) as { success: boolean; error: string }
              store._handleError(result.error)
            } catch {
              store._handleError('Deployment failed')
            }
          } else {
            store._handleError('Connection lost during deployment')
          }
        })

        eventSource.onerror = () => {
          store._handleConnectionLost()
        }
      },

      /**
       * Reset store state (for starting fresh)
       */
      reset() {
        const log = getLog()
        log.debug('Resetting deployment store', { appId: self.appId, hadLogs: self.logs.length })

        if (self.eventSource) {
          self.eventSource.close()
          self.eventSource = null
        }

        self.appId = null
        self.isDeploying = false
        self.logs.clear()
        self.stage = null
        self.error = null
        self.deployment = null
      },

      /**
       * Close connection without resetting state (for unmount)
       */
      disconnect() {
        const log = getLog()
        if (self.eventSource) {
          log.debug('Disconnecting EventSource', { appId: self.appId })
          self.eventSource.close()
          self.eventSource = null
        }
      },
    }
  })

export type IDeploymentStreamStore = Instance<typeof DeploymentStreamStore>
