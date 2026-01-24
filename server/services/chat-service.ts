import { query } from '@anthropic-ai/claude-agent-sdk'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'
import { db, tasks, projects, repositories, apps, projectRepositories } from '../db'
import { eq } from 'drizzle-orm'
import type { PageContext } from '../../shared/types'

type ModelId = 'opus' | 'sonnet' | 'haiku'

const MODEL_MAP: Record<ModelId, string> = {
  opus: 'claude-opus-4-5',
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
}

interface ChatSession {
  id: string
  claudeSessionId?: string // Claude Agent SDK session ID for resume
  createdAt: Date
}

// In-memory session storage
const sessions = new Map<string, ChatSession>()

// Session cleanup - remove sessions older than 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id)
      log.chat.debug('Session expired and cleaned up', { sessionId: id })
    }
  }
}, 5 * 60 * 1000) // Check every 5 minutes

/**
 * Create a new chat session
 */
export function createSession(): string {
  const id = crypto.randomUUID()
  const session: ChatSession = {
    id,
    createdAt: new Date(),
  }
  sessions.set(id, session)
  log.chat.info('Created chat session', { sessionId: id })
  return id
}

/**
 * Get a session by ID
 */
export function getSession(id: string): ChatSession | undefined {
  return sessions.get(id)
}

/**
 * End a chat session
 */
export function endSession(id: string): boolean {
  const session = sessions.get(id)
  if (session) {
    sessions.delete(id)
    log.chat.info('Ended chat session', { sessionId: id })
    return true
  }
  return false
}

/**
 * Build the system prompt for the chat assistant with page context
 */
async function buildSystemPrompt(context?: PageContext): Promise<string> {
  let prompt = `You are an AI assistant integrated into Fulcrum, a terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

You have access to Fulcrum's MCP tools which allow you to:
- List, create, update, and manage tasks
- View and manage projects and repositories
- Execute shell commands
- Manage app deployments
- Send notifications
- And more

When users ask you to do something, use the appropriate tools to help them. Be concise and helpful.

Important guidelines:
- Use tools proactively to gather information or complete tasks
- Present results clearly and concisely
- If a task requires multiple steps, explain what you're doing
- For destructive operations (delete, etc.), confirm with the user first unless they're explicit`

  if (!context) {
    return prompt
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
          const project = db.select().from(projects).where(eq(projects.id, context.filters.project)).get()
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
        const repo = db.select().from(repositories).where(eq(repositories.id, context.repositoryId)).get()
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
      contextParts.push(context.pageType === 'jobs' ? 'Viewing scheduled jobs list' : `Viewing job details`)
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
    prompt += `\n\nCurrent Context:\n${contextParts.map((p) => `- ${p}`).join('\n')}`
  }

  return prompt
}

/**
 * Stream a chat message response using Claude Agent SDK
 */
export async function* streamMessage(
  sessionId: string,
  userMessage: string,
  modelId: ModelId = 'sonnet',
  context?: PageContext
): AsyncGenerator<{ type: string; data: unknown }> {
  const session = sessions.get(sessionId)
  if (!session) {
    yield { type: 'error', data: { message: 'Session not found' } }
    return
  }

  const settings = getSettings()
  const port = settings.server.port

  try {
    log.chat.debug('Starting Claude Agent SDK query', {
      sessionId,
      hasResume: !!session.claudeSessionId,
      pageType: context?.pageType,
    })

    // Build system prompt with page context
    const systemPrompt = await buildSystemPrompt(context)

    // Create query with Claude Agent SDK
    const result = query({
      prompt: userMessage,
      options: {
        model: MODEL_MAP[modelId],
        resume: session.claudeSessionId, // Resume conversation if exists
        includePartialMessages: true, // Stream partial messages
        mcpServers: {
          fulcrum: {
            type: 'http',
            url: `http://localhost:${port}/mcp`,
          },
        },
        systemPrompt,
        permissionMode: 'bypassPermissions', // Bypass all permissions for seamless chat
        allowDangerouslySkipPermissions: true, // Required for bypassPermissions mode
      },
    })

    let currentText = ''

    // Stream messages from the SDK
    for await (const message of result) {
      if (message.type === 'stream_event') {
        // Streaming partial message
        const event = (message as { type: 'stream_event'; event: { type: string; delta?: { type: string; text?: string } } }).event

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          currentText += event.delta.text
          yield { type: 'content:delta', data: { text: event.delta.text } }
        }
      } else if (message.type === 'assistant') {
        // Complete assistant message - save session ID for resume
        const assistantMsg = message as { type: 'assistant'; session_id: string; message: { content: Array<{ type: string; text?: string }> } }
        session.claudeSessionId = assistantMsg.session_id

        // Extract final text content
        const textContent = assistantMsg.message.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text)
          .join('')

        if (textContent) {
          // If we haven't streamed all the content yet, yield remaining
          if (textContent.length > currentText.length) {
            const remaining = textContent.slice(currentText.length)
            if (remaining) {
              yield { type: 'content:delta', data: { text: remaining } }
            }
          }
          yield { type: 'message:complete', data: { content: textContent } }
        }
      } else if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
        // System init message - MCP servers connected
        log.chat.debug('Claude Agent SDK initialized', { sessionId })
      } else if (message.type === 'result') {
        // Final result with usage info
        const resultMsg = message as { type: 'result'; subtype?: string; session_id: string; total_cost_usd?: number; is_error?: boolean; errors?: string[] }

        if (resultMsg.subtype?.startsWith('error_')) {
          const errors = resultMsg.errors || ['Unknown error']
          yield { type: 'error', data: { message: errors.join(', ') } }
        }

        log.chat.debug('Query completed', {
          sessionId,
          cost: resultMsg.total_cost_usd,
          isError: resultMsg.is_error,
        })
      }
    }

    yield { type: 'done', data: {} }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.chat.error('Chat stream error', { sessionId, error: errorMsg })
    yield { type: 'error', data: { message: errorMsg } }
  }
}

/**
 * Get session info
 */
export function getSessionInfo(sessionId: string): { id: string; hasConversation: boolean } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    id: session.id,
    hasConversation: !!session.claudeSessionId,
  }
}
