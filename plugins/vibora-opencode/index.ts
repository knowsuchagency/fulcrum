import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync } from "node:fs"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

declare const process: { env: Record<string, string | undefined> }

const LOG_FILE = join(tmpdir(), "vibora-opencode.log")
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
 * Execute vibora command using execFile with shell option for proper PATH resolution.
 * Using execFile with explicit args array prevents shell injection while shell:true
 * ensures PATH is properly resolved (for NVM, fnm, etc. managed node installations).
 */
async function runViboraCommand(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(VIBORA_CMD, args, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        const execError = error as NodeJS.ErrnoException
        resolve({ exitCode: execError.code ? 1 : 1, stdout: stdout || '', stderr: stderr || execError.message || '' })
      } else {
        resolve({ exitCode: 0, stdout: stdout || '', stderr: stderr || '' })
      }
    })
  })
}

let mainSessionId: string | null = null
const subagentSessions = new Set<string>()
let pendingIdleTimer: ReturnType<typeof setTimeout> | null = null
let activityVersion = 0
let lastStatus: "in-progress" | "review" | "" = ""

const VIBORA_CMD = "vibora"
const IDLE_CONFIRMATION_DELAY_MS = 1500

let deferredContextCheck: Promise<boolean> | null = null
let isViboraContext: boolean | null = null

export const ViboraPlugin: Plugin = async ({ $, directory }) => {
  log("Plugin initializing...")

  if (process.env.VIBORA_TASK_ID) {
    isViboraContext = true
    log("Vibora context detected via env var")
  } else {
    deferredContextCheck = Promise.all([
      $`${VIBORA_CMD} --version`.quiet().nothrow().text(),
      runViboraCommand(['current-task', '--path', directory]),
    ])
      .then(([versionResult, taskResult]) => {
        if (!versionResult) {
          log("Vibora CLI not found")
          return false
        }
        const inContext = taskResult.exitCode === 0
        log(inContext ? "Vibora context active" : "Not a Vibora context")
        return inContext
      })
      .catch(() => {
        log("Vibora check failed")
        return false
      })
  }

  log("Plugin hooks registered")

  const checkContext = async (): Promise<boolean> => {
    if (isViboraContext !== null) return isViboraContext
    if (deferredContextCheck) {
      isViboraContext = await deferredContextCheck
      deferredContextCheck = null
      return isViboraContext
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
    lastStatus = status
    ;(async () => {
      try {
        log(`Setting status: ${status}`)
        const res = await runViboraCommand(['current-task', status, '--path', directory])
        if (res.exitCode !== 0) {
          log(`Status update failed: exitCode=${res.exitCode}, stderr=${res.stderr}`)
        }
      } catch (e) {
        log(`Status update error: ${e}`)
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
