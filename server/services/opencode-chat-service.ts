import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { log } from '../lib/logger'
import { db, tasks, projects, repositories, apps, projectRepositories } from '../db'
import { eq } from 'drizzle-orm'
import type { PageContext } from '../../shared/types'

// Default OpenCode server port
const OPENCODE_DEFAULT_PORT = 4096

interface OpencodeSession {
  id: string
  opencodeSessionId?: string // OpenCode SDK session ID
  createdAt: Date
}

// In-memory session storage
const sessions = new Map<string, OpencodeSession>()

// OpenCode client singleton
let opencodeClient: OpencodeClient | null = null

async function getClient(): Promise<OpencodeClient> {
  if (!opencodeClient) {
    // Try to connect to a running OpenCode server
    // OpenCode typically runs on port 14000
    const baseUrl = `http://localhost:${OPENCODE_DEFAULT_PORT}`

    opencodeClient = createOpencodeClient({
      baseUrl,
    })
  }
  return opencodeClient
}

// Session cleanup - remove sessions older than 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id)
      log.chat.debug('OpenCode session expired and cleaned up', { sessionId: id })
    }
  }
}, 5 * 60 * 1000) // Check every 5 minutes

/**
 * Create a new OpenCode chat session
 */
export function createOpencodeSession(): string {
  const id = crypto.randomUUID()
  const session: OpencodeSession = {
    id,
    createdAt: new Date(),
  }
  sessions.set(id, session)
  log.chat.info('Created OpenCode chat session', { sessionId: id })
  return id
}

/**
 * Get a session by ID
 */
export function getOpencodeSession(id: string): OpencodeSession | undefined {
  return sessions.get(id)
}

/**
 * End an OpenCode chat session
 */
export function endOpencodeSession(id: string): boolean {
  const session = sessions.get(id)
  if (session) {
    sessions.delete(id)
    log.chat.info('Ended OpenCode chat session', { sessionId: id })
    return true
  }
  return false
}

/**
 * Build the system prompt for the chat assistant with page context
 */
async function buildContextMessage(context?: PageContext): Promise<string | null> {
  if (!context) {
    return null
  }

  // Add page-specific context
  const contextParts: string[] = []
  contextParts.push(`Current page: ${context.path}`)

  switch (context.pageType) {
    case 'task': {
      if (context.taskId) {
        const task = db.select().from(tasks).where(eq(tasks.id, context.taskId)).get()
        if (task) {
          contextParts.push(`Viewing task: "${task.title}"`)
          contextParts.push(`Status: ${task.status}`)
          if (task.branch) contextParts.push(`Branch: ${task.branch}`)
          if (task.repoName) contextParts.push(`Repository: ${task.repoName}`)
          if (task.description) contextParts.push(`Description: ${task.description}`)
          if (task.worktreePath) contextParts.push(`Worktree: ${task.worktreePath}`)
        }
      }
      break
    }

    case 'tasks': {
      contextParts.push('Viewing the tasks kanban board')
      if (context.filters?.project) {
        if (context.filters.project === 'inbox') {
          contextParts.push('Filtered to: Inbox (tasks without a project)')
        } else {
          const project = db
            .select()
            .from(projects)
            .where(eq(projects.id, context.filters.project))
            .get()
          if (project) {
            contextParts.push(`Filtered to project: "${project.name}"`)
          }
        }
      }
      if (context.filters?.tags?.length) {
        contextParts.push(`Filtered by tags: ${context.filters.tags.join(', ')}`)
      }
      if (context.filters?.view) {
        contextParts.push(`View mode: ${context.filters.view}`)
      }
      break
    }

    case 'project': {
      if (context.projectId) {
        const project = db.select().from(projects).where(eq(projects.id, context.projectId)).get()
        if (project) {
          contextParts.push(`Viewing project: "${project.name}"`)
          if (project.description) contextParts.push(`Description: ${project.description}`)
          if (project.status) contextParts.push(`Status: ${project.status}`)

          // Count repositories
          const repoLinks = db
            .select()
            .from(projectRepositories)
            .where(eq(projectRepositories.projectId, context.projectId))
            .all()
          if (repoLinks.length > 0) {
            contextParts.push(`Linked repositories: ${repoLinks.length}`)
          }
        }
      }
      break
    }

    case 'projects': {
      contextParts.push('Viewing the projects list')
      break
    }

    case 'repository': {
      if (context.repositoryId) {
        const repo = db
          .select()
          .from(repositories)
          .where(eq(repositories.id, context.repositoryId))
          .get()
        if (repo) {
          contextParts.push(`Viewing repository: "${repo.displayName}"`)
          contextParts.push(`Path: ${repo.path}`)
          if (repo.defaultAgent) contextParts.push(`Default agent: ${repo.defaultAgent}`)
          if (repo.remoteUrl) contextParts.push(`Remote: ${repo.remoteUrl}`)
        }
      }
      break
    }

    case 'repositories': {
      contextParts.push('Viewing the repositories list')
      break
    }

    case 'app': {
      if (context.appId) {
        const app = db.select().from(apps).where(eq(apps.id, context.appId)).get()
        if (app) {
          contextParts.push(`Viewing app: "${app.name}"`)
          contextParts.push(`Status: ${app.status}`)
          contextParts.push(`Branch: ${app.branch}`)
          if (app.lastDeployedAt) contextParts.push(`Last deployed: ${app.lastDeployedAt}`)
        }
      }
      break
    }

    case 'apps': {
      contextParts.push('Viewing the apps deployment list')
      break
    }

    case 'monitoring': {
      contextParts.push('Viewing the monitoring dashboard')
      if (context.activeTab) {
        contextParts.push(`Active tab: ${context.activeTab}`)
      }
      break
    }

    case 'terminals': {
      contextParts.push('Viewing the persistent terminals page')
      break
    }

    case 'jobs':
    case 'job': {
      contextParts.push(
        context.pageType === 'jobs' ? 'Viewing scheduled jobs list' : `Viewing job details`
      )
      if (context.jobId) {
        contextParts.push(`Job ID: ${context.jobId}`)
      }
      break
    }

    case 'settings': {
      contextParts.push('Viewing the settings page')
      break
    }
  }

  if (contextParts.length > 0) {
    return `Context:\n${contextParts.map((p) => `- ${p}`).join('\n')}`
  }

  return null
}

/**
 * Stream a chat message response using OpenCode SDK with SSE events
 */
export async function* streamOpencodeMessage(
  sessionId: string,
  userMessage: string,
  model?: string,
  context?: PageContext
): AsyncGenerator<{ type: string; data: unknown }> {
  const session = sessions.get(sessionId)
  if (!session) {
    yield { type: 'error', data: { message: 'Session not found' } }
    return
  }

  try {
    log.chat.debug('Starting OpenCode SDK query', {
      sessionId,
      hasResume: !!session.opencodeSessionId,
      pageType: context?.pageType,
      model,
    })

    const client = await getClient()

    // Build context message
    const contextMessage = await buildContextMessage(context)
    const fullMessage = contextMessage ? `${contextMessage}\n\n${userMessage}` : userMessage

    // Create or get OpenCode session
    let opencodeSessionId = session.opencodeSessionId
    if (!opencodeSessionId) {
      // Create a new OpenCode session
      // Parse model string "provider/modelId" into separate fields
      // e.g., "openrouter/z-ai/glm-4.7" -> providerID: "openrouter", modelID: "z-ai/glm-4.7"
      let modelConfig: { providerID: string; modelID: string } | undefined
      if (model) {
        const slashIndex = model.indexOf('/')
        if (slashIndex > 0) {
          modelConfig = {
            providerID: model.substring(0, slashIndex),
            modelID: model.substring(slashIndex + 1),
          }
        }
      }

      log.chat.debug('Creating OpenCode session', { model, modelConfig })

      const newSession = await client.session.create({
        body: {
          ...(modelConfig && { model: modelConfig }),
        },
      })
      if (newSession.error) {
        throw new Error(newSession.error.message || 'Failed to create OpenCode session')
      }
      opencodeSessionId = newSession.data?.id
      session.opencodeSessionId = opencodeSessionId
      log.chat.debug('Created new OpenCode session', { opencodeSessionId })
    }

    if (!opencodeSessionId) {
      throw new Error('Failed to get OpenCode session ID')
    }

    // Subscribe to events before sending the prompt
    log.chat.debug('Subscribing to OpenCode events', { opencodeSessionId })
    const eventResult = await client.event.subscribe()

    // Parse model string for prompt (may need to re-parse if session existed)
    let promptModelConfig: { providerID: string; modelID: string } | undefined
    if (model) {
      const slashIndex = model.indexOf('/')
      if (slashIndex > 0) {
        promptModelConfig = {
          providerID: model.substring(0, slashIndex),
          modelID: model.substring(slashIndex + 1),
        }
      }
    }

    // Send the prompt asynchronously - include model to ensure it's used
    log.chat.debug('Sending prompt to OpenCode', { opencodeSessionId, model, promptModelConfig, messageLength: fullMessage.length })
    const promptPromise = client.session.prompt({
      path: { id: opencodeSessionId },
      body: {
        parts: [{ type: 'text', text: fullMessage }],
        ...(promptModelConfig && { model: promptModelConfig }),
      },
    })

    // Collect full response text
    let responseText = ''
    let isComplete = false
    const timeout = 120000 // 2 minute timeout
    const startTime = Date.now()

    // Track text per message part to compute deltas
    // The event sends full text each time, not just the new part
    const partTextCache = new Map<string, string>()
    let userMessageId: string | null = null

    // Process events from the stream (eventResult.stream is the async generator)
    for await (const event of eventResult.stream) {
      if (Date.now() - startTime > timeout) {
        log.chat.warn('OpenCode event stream timeout', { sessionId })
        break
      }

      // Event has type and properties at top level
      const evt = event as {
        type?: string
        properties?: {
          part?: { type?: string; text?: string; messageID?: string; sessionID?: string; id?: string }
          info?: { role?: string; sessionID?: string; id?: string }
          message?: string
          sessionID?: string
        }
      }

      // Get session ID from event properties (different events store it differently)
      const eventSessionId = evt.properties?.sessionID ||
                             evt.properties?.part?.sessionID ||
                             evt.properties?.info?.sessionID

      // Skip events that aren't for our session (except server.connected which is global)
      if (evt.type !== 'server.connected' && eventSessionId && eventSessionId !== opencodeSessionId) {
        continue
      }

      // Track the user message ID so we can skip its text updates
      if (evt.type === 'message.updated') {
        const info = evt.properties?.info
        if (info?.role === 'user' && info?.id) {
          userMessageId = info.id
        }
      }

      // Handle text updates from assistant messages
      // message.part.updated contains the FULL text so far, not just delta
      if (evt.type === 'message.part.updated') {
        const part = evt.properties?.part
        if (part?.type === 'text' && part?.text && part?.id) {
          // Skip user message text updates
          if (part.messageID === userMessageId) {
            continue
          }

          // Compute delta from previous text
          const prevText = partTextCache.get(part.id) || ''
          const fullText = part.text
          const delta = fullText.slice(prevText.length)

          if (delta) {
            partTextCache.set(part.id, fullText)
            responseText = fullText // Track full response
            yield { type: 'content:delta', data: { text: delta } }
          }
        }
      }

      // Handle session becoming idle (response complete) - only for our session
      if (evt.type === 'session.idle' && evt.properties?.sessionID === opencodeSessionId) {
        log.chat.debug('Session idle, response complete', { sessionId })
        isComplete = true
        break
      }

      // Handle errors for our session
      if (evt.type === 'session.error' && evt.properties?.sessionID === opencodeSessionId) {
        throw new Error(evt.properties?.message || 'OpenCode session error')
      }
    }

    // Wait for the prompt request to complete
    const promptResponse = await promptPromise
    if (promptResponse.error) {
      log.chat.error('OpenCode prompt error', { error: promptResponse.error })
      // Don't throw if we already got content via events
      if (!responseText) {
        throw new Error(promptResponse.error.message || JSON.stringify(promptResponse.error) || 'Failed to send message')
      }
    }

    // If we didn't get content from events, try to get it from session messages
    if (!responseText) {
      log.chat.debug('No content from events, fetching messages', { opencodeSessionId })
      const messagesResponse = await client.session.messages({
        path: { id: opencodeSessionId },
      })

      log.chat.debug('Messages response', {
        hasData: !!messagesResponse.data,
        isArray: Array.isArray(messagesResponse.data),
        messageCount: Array.isArray(messagesResponse.data) ? messagesResponse.data.length : 0,
        rawData: JSON.stringify(messagesResponse.data).slice(0, 1000),
      })

      if (messagesResponse.data && Array.isArray(messagesResponse.data)) {
        // Get the last assistant message
        for (let i = messagesResponse.data.length - 1; i >= 0; i--) {
          const msg = messagesResponse.data[i] as { role?: string; parts?: Array<{ type?: string; text?: string; content?: string }> }
          log.chat.debug('Checking message', { index: i, role: msg.role, hasParts: !!msg.parts })
          if (msg.role === 'assistant' && msg.parts) {
            for (const part of msg.parts) {
              // Text might be in 'text' or 'content' field
              const text = part.text || part.content
              if (part.type === 'text' && text) {
                responseText += text
              }
            }
            break
          }
        }
      }

      // Stream the fetched response
      if (responseText) {
        const chunkSize = 50
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, i + chunkSize)
          yield { type: 'content:delta', data: { text: chunk } }
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }
    }

    yield { type: 'message:complete', data: { content: responseText } }
    yield { type: 'done', data: {} }

    log.chat.debug('OpenCode query completed', { sessionId, responseLength: responseText.length })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.chat.error('OpenCode chat stream error', { sessionId, error: errorMsg })

    // Check if it's a connection error (OpenCode not running)
    if (
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('network')
    ) {
      yield {
        type: 'error',
        data: { message: 'OpenCode is not running. Please start OpenCode first.' },
      }
    } else {
      yield { type: 'error', data: { message: errorMsg } }
    }
  }
}

/**
 * Get session info
 */
export function getOpencodeSessionInfo(
  sessionId: string
): { id: string; hasConversation: boolean } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    id: session.id,
    hasConversation: !!session.opencodeSessionId,
  }
}
