import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ContentBlockParam, ToolResultBlockParam, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8192

interface ChatSession {
  id: string
  messages: MessageParam[]
  taskId?: string
  mcpClient?: Client
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
      if (session.mcpClient) {
        session.mcpClient.close().catch(() => {})
      }
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
    messages: [],
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
    if (session.mcpClient) {
      session.mcpClient.close().catch(() => {})
    }
    sessions.delete(id)
    log.chat.info('Ended chat session', { sessionId: id })
    return true
  }
  return false
}

/**
 * Get MCP tools from Fulcrum's MCP server
 */
async function getMcpTools(session: ChatSession): Promise<Anthropic.Tool[]> {
  const settings = getSettings()
  const port = settings.server.port

  // Create MCP client if not exists
  if (!session.mcpClient) {
    const transport = new SSEClientTransport(new URL(`http://localhost:${port}/mcp`))
    const client = new Client({ name: 'fulcrum-chat', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    session.mcpClient = client
    log.chat.debug('Connected to MCP server', { sessionId: session.id })
  }

  // List available tools
  const { tools } = await session.mcpClient.listTools()

  // Convert MCP tools to Anthropic tool format
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }))
}

/**
 * Execute an MCP tool
 */
async function executeMcpTool(
  session: ChatSession,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!session.mcpClient) {
    throw new Error('MCP client not initialized')
  }

  try {
    const result = await session.mcpClient.callTool({ name: toolName, arguments: toolInput })

    // Extract text content from result
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
      return textParts.join('\n')
    }

    return JSON.stringify(result)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.chat.error('MCP tool execution failed', { tool: toolName, error: errorMsg })
    return `Error executing tool: ${errorMsg}`
  }
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
 * Stream a chat message response
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

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    yield { type: 'error', data: { message: 'ANTHROPIC_API_KEY environment variable not set. Please set it in your environment.' } }
    return
  }

  const anthropic = new Anthropic({ apiKey })

  try {
    // Get MCP tools
    let tools: Anthropic.Tool[] = []
    try {
      tools = await getMcpTools(session)
      log.chat.debug('Loaded MCP tools', { count: tools.length })
    } catch (err) {
      log.chat.warn('Failed to load MCP tools, proceeding without them', { error: String(err) })
    }

    // Add user message to history
    session.messages.push({ role: 'user', content: userMessage })

    // Tool use loop - keep processing until no more tool calls
    let continueLoop = true
    while (continueLoop) {
      continueLoop = false

      // Create streaming message
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(session.taskId),
        messages: session.messages,
        tools: tools.length > 0 ? tools : undefined,
      })

      // Collect the full response
      const contentBlocks: ContentBlockParam[] = []
      let currentText = ''
      let stopReason: string | null = null

      // Stream text deltas
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            currentText = event.content_block.text
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentText += event.delta.text
            yield { type: 'content:delta', data: { text: event.delta.text } }
          }
        } else if (event.type === 'content_block_stop') {
          // Content block completed
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            stopReason = event.delta.stop_reason
          }
        }
      }

      // Get the final message
      const finalMessage = await stream.finalMessage()

      // Add assistant message to history
      session.messages.push({ role: 'assistant', content: finalMessage.content })

      // Check if there are tool uses to process
      const toolUses = finalMessage.content.filter((block): block is ToolUseBlock => block.type === 'tool_use')

      if (toolUses.length > 0 && stopReason === 'tool_use') {
        // Process tool calls
        const toolResults: ToolResultBlockParam[] = []

        for (const toolUse of toolUses) {
          yield { type: 'tool:start', data: { name: toolUse.name, input: toolUse.input } }

          try {
            const result = await executeMcpTool(session, toolUse.name, toolUse.input as Record<string, unknown>)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result,
            })
            yield { type: 'tool:result', data: { name: toolUse.name, result } }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${errorMsg}`,
              is_error: true,
            })
            yield { type: 'tool:error', data: { name: toolUse.name, error: errorMsg } }
          }
        }

        // Add tool results to messages and continue the loop
        session.messages.push({ role: 'user', content: toolResults })
        continueLoop = true
      }
    }

    // Get final text content for the complete message
    const lastAssistantMessage = session.messages[session.messages.length - 1]
    if (lastAssistantMessage.role === 'assistant' && Array.isArray(lastAssistantMessage.content)) {
      const textContent = (lastAssistantMessage.content as Array<TextBlock | ToolUseBlock>)
        .filter((block): block is TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
      yield { type: 'message:complete', data: { content: textContent } }
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
export function getSessionInfo(sessionId: string): { id: string; messageCount: number; taskId?: string } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return {
    id: session.id,
    messageCount: session.messages.length,
    taskId: session.taskId,
  }
}
