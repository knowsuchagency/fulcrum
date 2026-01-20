import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

declare const process: { env: Record<string, string | undefined> }

const LOG_FILE = join(tmpdir(), "fulcrum-opencode.log")
const NOISY_EVENTS = new Set([
  "message.part.updated",
  "file.watcher.updated",
  "tui.toast.show",
  "config.updated",
])
const log = (msg: string) => {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    // Silently ignore logging errors - logging is non-critical
  }
}

/**
 * Execute fulcrum command using spawn with shell option for proper PATH resolution.
 * Using spawn with explicit args array prevents shell injection while shell:true
 * ensures PATH is properly resolved (for NVM, fnm, etc. managed node installations).
 * Includes 10 second timeout protection to prevent hanging.
 */
async function runFulcrumCommand(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let resolved = false
    let processExited = false
    let killTimeoutId: ReturnType<typeof setTimeout> | null = null

    const child = spawn(FULCRUM_CMD, args, { shell: true })

    const cleanup = () => {
      processExited = true
      if (killTimeoutId) {
        clearTimeout(killTimeoutId)
        killTimeoutId = null
      }
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      cleanup()
      if (!resolved) {
        resolved = true
        resolve({ exitCode: code || 0, stdout, stderr })
      }
    })

    child.on('error', (err) => {
      cleanup()
      if (!resolved) {
        resolved = true
        resolve({ exitCode: 1, stdout, stderr: err.message || '' })
      }
    })

    // Add timeout protection to prevent hanging
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        log(`Command timeout: ${FULCRUM_CMD} ${args.join(' ')}`)
        child.kill('SIGTERM')
        // Schedule SIGKILL if process doesn't exit after SIGTERM
        killTimeoutId = setTimeout(() => {
          if (!processExited) {
            log(`Process didn't exit after SIGTERM, sending SIGKILL`)
            child.kill('SIGKILL')
          }
        }, 2000)
        resolve({ exitCode: -1, stdout, stderr: `Command timed out after ${FULCRUM_COMMAND_TIMEOUT_MS}ms` })
      }
    }, FULCRUM_COMMAND_TIMEOUT_MS)

    // Clear timeout if command completes
    child.on('exit', () => clearTimeout(timeoutId))
  })
}

let mainSessionId: string | null = null
const subagentSessions = new Set<string>()
let pendingIdleTimer: ReturnType<typeof setTimeout> | null = null
let activityVersion = 0
let lastStatus: "in-progress" | "review" | "" = ""

const FULCRUM_CMD = "fulcrum"
const IDLE_CONFIRMATION_DELAY_MS = 1500
const FULCRUM_COMMAND_TIMEOUT_MS = 10000
const STATUS_CHANGE_DEBOUNCE_MS = 500

let deferredContextCheck: Promise<boolean> | null = null
let isFulcrumContext: boolean | null = null
let pendingStatusCommand: Promise<{ exitCode: number; stdout: string; stderr: string }> | null = null

export const FulcrumPlugin: Plugin = async ({ $, directory }) => {
  log("Plugin initializing...")

  if (process.env.FULCRUM_TASK_ID) {
    isFulcrumContext = true
    log("Fulcrum context detected via env var")
  } else {
    deferredContextCheck = Promise.all([
      $`${FULCRUM_CMD} --version`.quiet().nothrow().text(),
      runFulcrumCommand(['current-task', '--path', directory]),
    ])
      .then(([versionResult, taskResult]) => {
        if (!versionResult) {
          log("Fulcrum CLI not found")
          return false
        }
        const inContext = taskResult.exitCode === 0
        log(inContext ? "Fulcrum context active" : "Not a Fulcrum context")
        return inContext
      })
      .catch(() => {
        log("Fulcrum check failed")
        return false
      })
  }

  log("Plugin hooks registered")

  const checkContext = async (): Promise<boolean> => {
    if (isFulcrumContext !== null) return isFulcrumContext
    if (deferredContextCheck) {
      isFulcrumContext = await deferredContextCheck
      deferredContextCheck = null
      return isFulcrumContext
    }
    return false
  }

  const cancelPendingIdle = () => {
    if (pendingIdleTimer) {
      clearTimeout(pendingIdleTimer)
      pendingIdleTimer = null
      log("Cancelled pending idle transition")
    }
  }

  const setStatus = (status: "in-progress" | "review") => {
    if (status === lastStatus) return

    cancelPendingIdle()

    if (pendingStatusCommand) {
      log(`Status change already in progress, will retry after ${STATUS_CHANGE_DEBOUNCE_MS}ms`)
      setTimeout(() => setStatus(status), STATUS_CHANGE_DEBOUNCE_MS)
      return
    }

    lastStatus = status

    ;(async () => {
      try {
        log(`Setting status: ${status}`)
        pendingStatusCommand = runFulcrumCommand(['current-task', status, '--path', directory])
        const res = await pendingStatusCommand
        pendingStatusCommand = null

        if (res.exitCode !== 0) {
          log(`Status update failed: exitCode=${res.exitCode}, stderr=${res.stderr}`)
        }
      } catch (e) {
        log(`Status update error: ${e}`)
        pendingStatusCommand = null
      }
    })()
  }

  const scheduleIdleTransition = () => {
    cancelPendingIdle()
    const currentVersion = ++activityVersion

    pendingIdleTimer = setTimeout(() => {
      if (activityVersion !== currentVersion) {
        log(
          `Stale idle transition (version ${currentVersion} vs ${activityVersion})`,
        )
        return
      }
      setStatus("review")
    }, IDLE_CONFIRMATION_DELAY_MS)

    log(
      `Scheduled idle transition (version ${currentVersion}, delay ${IDLE_CONFIRMATION_DELAY_MS}ms)`,
    )
  }

  const recordActivity = (reason: string) => {
    activityVersion++
    cancelPendingIdle()
    log(`Activity: ${reason} (version now ${activityVersion})`)
  }

  return {
    "chat.message": async (_input, output) => {
      if (!(await checkContext())) return

      if (output.message.role === "user") {
        recordActivity("user message")
        setStatus("in-progress")
      } else if (output.message.role === "assistant") {
        recordActivity("assistant message")
      }
    },

    event: async ({ event }) => {
      if (!NOISY_EVENTS.has(event.type)) {
        log(`Event: ${event.type}`)
      }

      if (!(await checkContext())) return

      const props = (event.properties as Record<string, unknown>) || {}

      if (event.type === "session.created") {
        const info = (props.info as Record<string, unknown>) || {}
        const sessionId = info.id as string | undefined
        const parentId = info.parentID as string | undefined

        if (parentId) {
          if (sessionId) subagentSessions.add(sessionId)
          log(`Subagent session tracked: ${sessionId} (parent: ${parentId})`)
        } else if (!mainSessionId && sessionId) {
          mainSessionId = sessionId
          log(`Main session set: ${mainSessionId}`)
        }

        recordActivity("session.created")
        setStatus("in-progress")
        return
      }

      const status = props.status as Record<string, unknown> | undefined
      if (
        (event.type === "session.status" && status?.type === "busy") ||
        event.type.startsWith("tool.execute")
      ) {
        recordActivity(event.type)
        return
      }

      if (
        event.type === "session.idle" ||
        (event.type === "session.status" && status?.type === "idle")
      ) {
        const info = (props.info as Record<string, unknown>) || {}
        const sessionId =
          (props.sessionID as string) || (info.id as string) || null

        if (sessionId && subagentSessions.has(sessionId)) {
          log(`Ignoring subagent idle: ${sessionId}`)
          return
        }

        if (mainSessionId && sessionId && sessionId !== mainSessionId) {
          log(`Ignoring non-main idle: ${sessionId} (main: ${mainSessionId})`)
          return
        }

        log(`Main session idle detected: ${sessionId}`)
        scheduleIdleTransition()
      }
    },
  }
}
