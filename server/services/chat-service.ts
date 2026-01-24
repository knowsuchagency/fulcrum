import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'

const MODEL = 'claude-sonnet-4-20250514'

interface ChatSession {
  id: string
  claudeSessionId?: string // Claude Agent SDK session ID for resume
  taskId?: string
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
export function createSession(taskId?: string): string {
  const id = crypto.randomUUID()
  const session: ChatSession = {
    id,
    taskId,
    createdAt: new Date(),
  }
  sessions.set(id, session)
  log.chat.info('Created chat session', { sessionId: id, taskId })
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
 * Build the system prompt for the chat assistant
 */
function buildSystemPrompt(taskId?: string): string {
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

  if (taskId) {
    prompt += `\n\nContext: The user is currently viewing task ID: ${taskId}. You can use get_task to fetch details about this task.`
  }

  return prompt
}

/**
 * Stream a chat message response using Claude Agent SDK
 */
export async function* streamMessage(
  sessionId: string,
  userMessage: string
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
      taskId: session.taskId,
    })

    // Create query with Claude Agent SDK
    const result = query({
      prompt: userMessage,
      options: {
        model: MODEL,
        resume: session.claudeSessionId, // Resume conversation if exists
        includePartialMessages: true, // Stream partial messages
        mcpServers: {
          fulcrum: {
            type: 'http',
            url: `http://localhost:${port}/mcp`,
          },
        },
        systemPrompt: buildSystemPrompt(session.taskId),
        permissionMode: 'bypassPermissions', // Bypass all permissions for seamless chat
        allowDangerouslySkipPermissions: true, // Required for bypassPermissions mode
      },
    })

    let currentText = ''
    let lastYieldedLength = 0

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
export function getSessionInfo(sessionId: string): { id: string; taskId?: string; hasConversation: boolean } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    id: session.id,
    taskId: session.taskId,
    hasConversation: !!session.claudeSessionId,
  }
}
