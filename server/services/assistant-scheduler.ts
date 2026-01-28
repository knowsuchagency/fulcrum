/**
 * Assistant Scheduler - Manages hourly sweeps and daily rituals.
 * Enables proactive messaging assistant behavior.
 */

import { nanoid } from 'nanoid'
import { eq, desc, sql, notInArray } from 'drizzle-orm'
import { db, actionableEvents, sweepRuns, tasks } from '../db'
import type { SweepRun, NewSweepRun } from '../db/schema'
import { log } from '../lib/logger'
import { getSettings } from '../lib/settings'
import * as assistantService from './assistant-service'
import { getOrCreateSession } from './channels/session-mapper'
import { getSweepSystemPrompt, getRitualSystemPrompt } from './channels/system-prompts'

// Intervals
const HOURLY_INTERVAL = 60 * 60 * 1000 // 1 hour

// Scheduler state
let hourlyIntervalId: ReturnType<typeof setInterval> | null = null
let morningTimeoutId: ReturnType<typeof setTimeout> | null = null
let eveningTimeoutId: ReturnType<typeof setTimeout> | null = null

// Dedicated session IDs for assistant operations
const SWEEP_SESSION_PREFIX = 'assistant-sweep'
const RITUAL_SESSION_PREFIX = 'assistant-ritual'

/**
 * Start the assistant scheduler.
 * Called on server startup.
 */
export function startAssistantScheduler(): void {
  const settings = getSettings()

  log.assistant.info('Starting assistant scheduler', {
    ritualsEnabled: settings.assistant.ritualsEnabled,
  })

  // Start hourly sweep (always runs to process incoming messages)
  runHourlySweep().catch((err) =>
    log.assistant.error('Initial sweep failed', { error: String(err) })
  )

  hourlyIntervalId = setInterval(() => {
    runHourlySweep().catch((err) =>
      log.assistant.error('Hourly sweep failed', { error: String(err) })
    )
  }, HOURLY_INTERVAL)

  // Schedule daily rituals
  scheduleNextRitual('morning')
  scheduleNextRitual('evening')
}

/**
 * Stop the assistant scheduler.
 * Called on server shutdown.
 */
export function stopAssistantScheduler(): void {
  if (hourlyIntervalId) {
    clearInterval(hourlyIntervalId)
    hourlyIntervalId = null
  }

  if (morningTimeoutId) {
    clearTimeout(morningTimeoutId)
    morningTimeoutId = null
  }

  if (eveningTimeoutId) {
    clearTimeout(eveningTimeoutId)
    eveningTimeoutId = null
  }

  log.assistant.info('Assistant scheduler stopped')
}

/**
 * Run the hourly sweep.
 */
async function runHourlySweep(): Promise<void> {
  const run = createSweepRun('hourly')

  try {
    const lastSweep = getLastSweepRun('hourly')
    const pendingCount = countEventsByStatus('pending')
    const openTaskCount = countOpenTasks()

    log.assistant.info('Running hourly sweep', {
      runId: run.id,
      pendingEvents: pendingCount,
      openTasks: openTaskCount,
    })

    // Get or create a session for sweep operations
    const { session } = getOrCreateSession(
      SWEEP_SESSION_PREFIX,
      'sweep-agent',
      'Assistant Sweep'
    )

    // Build the prompt
    const prompt = `Perform your hourly sweep. Last sweep: ${lastSweep?.completedAt ?? 'never'}`

    // Get the system prompt
    const systemPrompt = getSweepSystemPrompt({
      lastSweepTime: lastSweep?.completedAt ?? null,
      pendingCount,
      openTaskCount,
    })

    // Invoke assistant
    let eventsProcessed = 0
    let tasksUpdated = 0
    let messagesSent = 0
    let summary = ''

    const stream = assistantService.streamMessage(session.id, prompt, {
      systemPromptAdditions: systemPrompt,
    })

    for await (const event of stream) {
      if (event.type === 'message:complete') {
        const content = (event.data as { content: string }).content

        // Count tool usage from the response
        // The actual counts come from what the assistant did via MCP tools
        // For now, we just capture the summary
        summary = content

        // Parse basic metrics from the response
        const processedMatch = content.match(/(\d+)\s*events?\s*(reviewed|processed)/i)
        if (processedMatch) eventsProcessed = parseInt(processedMatch[1])

        const tasksMatch = content.match(/(\d+)\s*tasks?\s*(updated|created)/i)
        if (tasksMatch) tasksUpdated = parseInt(tasksMatch[1])

        const messagesMatch = content.match(/(\d+)\s*messages?\s*sent/i)
        if (messagesMatch) messagesSent = parseInt(messagesMatch[1])
      }
    }

    // Complete the sweep run
    completeSweepRun(run.id, {
      eventsProcessed,
      tasksUpdated,
      messagesSent,
      summary,
    })

    log.assistant.info('Hourly sweep completed', {
      runId: run.id,
      eventsProcessed,
      tasksUpdated,
      messagesSent,
    })
  } catch (err) {
    failSweepRun(run.id, String(err))
    throw err
  }
}

/**
 * Run a daily ritual (morning or evening).
 */
async function runDailyRitual(type: 'morning' | 'evening'): Promise<void> {
  const settings = getSettings()
  const config = settings.assistant[`${type}Ritual`]

  if (!settings.assistant.ritualsEnabled) {
    scheduleNextRitual(type)
    return
  }

  const run = createSweepRun(`${type}_ritual`)

  try {
    log.assistant.info(`Running ${type} ritual`, { runId: run.id })

    // Get or create a session for ritual operations
    const { session } = getOrCreateSession(
      RITUAL_SESSION_PREFIX,
      `${type}-ritual-agent`,
      `Assistant ${type} Ritual`
    )

    // Use the user's customizable prompt
    const prompt = config.prompt

    // Get the system prompt
    const systemPrompt = getRitualSystemPrompt(type)

    // Invoke assistant
    let messagesSent = 0
    let summary = ''

    const stream = assistantService.streamMessage(session.id, prompt, {
      systemPromptAdditions: systemPrompt,
    })

    for await (const event of stream) {
      if (event.type === 'message:complete') {
        const content = (event.data as { content: string }).content
        summary = content

        const messagesMatch = content.match(/(\d+)\s*messages?\s*sent/i)
        if (messagesMatch) messagesSent = parseInt(messagesMatch[1])
      }
    }

    // Complete the ritual run
    completeSweepRun(run.id, {
      eventsProcessed: 0,
      tasksUpdated: 0,
      messagesSent,
      summary,
    })

    log.assistant.info(`${type} ritual completed`, { runId: run.id, messagesSent })
  } catch (err) {
    failSweepRun(run.id, String(err))
    log.assistant.error(`${type} ritual failed`, { error: String(err) })
  }

  // Schedule the next occurrence
  scheduleNextRitual(type)
}

/**
 * Schedule the next occurrence of a daily ritual.
 */
function scheduleNextRitual(type: 'morning' | 'evening'): void {
  const settings = getSettings()
  const config = settings.assistant[`${type}Ritual`]

  if (!settings.assistant.ritualsEnabled) {
    log.assistant.debug(`Rituals disabled, not scheduling ${type} ritual`)
    return
  }

  // Parse the time string (e.g., "09:00")
  const [hours, minutes] = config.time.split(':').map(Number)

  // Calculate the next occurrence
  const now = new Date()
  const next = new Date()
  next.setHours(hours, minutes, 0, 0)

  // If the time has already passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  const delay = next.getTime() - now.getTime()

  log.assistant.info(`Scheduled ${type} ritual`, {
    nextRun: next.toISOString(),
    delayMs: delay,
  })

  const timeoutId = setTimeout(() => {
    runDailyRitual(type).catch((err) =>
      log.assistant.error(`${type} ritual error`, { error: String(err) })
    )
  }, delay)

  if (type === 'morning') {
    morningTimeoutId = timeoutId
  } else {
    eveningTimeoutId = timeoutId
  }
}

// ==================== Sweep Run Database Helpers ====================

function createSweepRun(type: 'hourly' | 'morning_ritual' | 'evening_ritual'): SweepRun {
  const id = nanoid()
  const now = new Date().toISOString()

  const run: NewSweepRun = {
    id,
    type,
    startedAt: now,
    status: 'running',
  }

  db.insert(sweepRuns).values(run).run()

  return db.select().from(sweepRuns).where(eq(sweepRuns.id, id)).get()!
}

function completeSweepRun(
  id: string,
  results: {
    eventsProcessed: number
    tasksUpdated: number
    messagesSent: number
    summary: string
  }
): void {
  db.update(sweepRuns)
    .set({
      completedAt: new Date().toISOString(),
      status: 'completed',
      eventsProcessed: results.eventsProcessed,
      tasksUpdated: results.tasksUpdated,
      messagesSent: results.messagesSent,
      summary: results.summary,
    })
    .where(eq(sweepRuns.id, id))
    .run()
}

function failSweepRun(id: string, error: string): void {
  db.update(sweepRuns)
    .set({
      completedAt: new Date().toISOString(),
      status: 'failed',
      summary: `Error: ${error}`,
    })
    .where(eq(sweepRuns.id, id))
    .run()
}

function getLastSweepRun(type: string): SweepRun | null {
  return db
    .select()
    .from(sweepRuns)
    .where(eq(sweepRuns.type, type))
    .orderBy(desc(sweepRuns.startedAt))
    .limit(1)
    .get() ?? null
}

function countEventsByStatus(status: string): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(actionableEvents)
    .where(eq(actionableEvents.status, status))
    .get()
  return result?.count ?? 0
}

function countOpenTasks(): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(notInArray(tasks.status, ['DONE', 'CANCELED']))
    .get()
  return result?.count ?? 0
}

// ==================== Message Sending ====================

/**
 * Send a message to a channel.
 * Used by the MCP `message` tool and internally by the assistant scheduler.
 */
export async function sendMessageToChannel(
  channel: 'email' | 'whatsapp' | 'discord' | 'telegram' | 'slack',
  to: string,
  body: string,
  options?: {
    subject?: string
    replyToMessageId?: string
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Import the messaging module to access active channels
  const { getEmailStatus, getWhatsAppStatus, getDiscordStatus } = await import('./channels')

  // Channel-specific sending
  switch (channel) {
    case 'email': {
      const emailStatus = getEmailStatus()
      if (!emailStatus?.enabled || emailStatus.status !== 'connected') {
        return { success: false, error: 'Email channel not connected' }
      }

      // Get the email channel and send
      const { sendEmailMessage } = await import('./channels/email-channel')
      try {
        const messageId = await sendEmailMessage(to, body, options?.subject, options?.replyToMessageId)
        log.assistant.info('Sent email message', { to, subject: options?.subject, messageId })
        return { success: true, messageId }
      } catch (err) {
        log.assistant.error('Failed to send email', { to, error: String(err) })
        return { success: false, error: String(err) }
      }
    }

    case 'whatsapp': {
      const waStatus = getWhatsAppStatus()
      if (!waStatus?.enabled || waStatus.status !== 'connected') {
        return { success: false, error: 'WhatsApp channel not connected' }
      }

      // Get the WhatsApp channel and send
      const { sendWhatsAppMessage } = await import('./channels/whatsapp-channel')
      try {
        await sendWhatsAppMessage(to, body)
        log.assistant.info('Sent WhatsApp message', { to })
        return { success: true }
      } catch (err) {
        log.assistant.error('Failed to send WhatsApp message', { to, error: String(err) })
        return { success: false, error: String(err) }
      }
    }

    case 'discord': {
      const discordStatus = getDiscordStatus()
      if (!discordStatus?.enabled || discordStatus.status !== 'connected') {
        return { success: false, error: 'Discord channel not connected' }
      }

      // Use the sendMessageToChannel from channels module
      const { sendMessageToChannel: sendViaChannel } = await import('./channels')
      return sendViaChannel('discord', to, body)
    }

    case 'telegram': {
      const { getTelegramStatus, sendMessageToChannel: sendViaTelegram } = await import('./channels')
      const telegramStatus = getTelegramStatus()
      if (!telegramStatus?.enabled || telegramStatus.status !== 'connected') {
        return { success: false, error: 'Telegram channel not connected' }
      }
      return sendViaTelegram('telegram', to, body)
    }

    case 'slack': {
      const { getSlackStatus, sendMessageToChannel: sendViaSlack } = await import('./channels')
      const slackStatus = getSlackStatus()
      if (!slackStatus?.enabled || slackStatus.status !== 'connected') {
        return { success: false, error: 'Slack channel not connected' }
      }
      return sendViaSlack('slack', to, body, options)
    }

    default:
      return { success: false, error: `Unknown channel: ${channel}` }
  }
}
