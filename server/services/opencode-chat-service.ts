import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { log } from '../lib/logger'
import { db, tasks, projects, repositories, apps, projectRepositories } from '../db'
import { eq } from 'drizzle-orm'
import type { PageContext } from '../../shared/types'

// Default OpenCode server port
const OPENCODE_DEFAULT_PORT = 14000

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
 * Stream a chat message response using OpenCode SDK
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
      const newSession = await client.session.create({
        body: {
          ...(model && { model }),
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

    // Send the message
    const response = await client.session.prompt({
      path: { id: opencodeSessionId },
      body: {
        parts: [{ type: 'text', text: fullMessage }],
        ...(model && { model }),
      },
    })

    if (response.error) {
      throw new Error(response.error.message || 'Failed to send message')
    }

    // Extract text content from the response
    let responseText = ''
    const data = response.data
    if (data && 'parts' in data && Array.isArray(data.parts)) {
      for (const part of data.parts) {
        if (part.type === 'text' && 'text' in part) {
          responseText += part.text
        }
      }
    }

    // Stream the response in chunks for a better UX
    const chunkSize = 50
    for (let i = 0; i < responseText.length; i += chunkSize) {
      const chunk = responseText.slice(i, i + chunkSize)
      yield { type: 'content:delta', data: { text: chunk } }
      // Small delay for visual streaming effect
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    yield { type: 'message:complete', data: { content: responseText } }
    yield { type: 'done', data: {} }

    log.chat.debug('OpenCode query completed', { sessionId })
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
