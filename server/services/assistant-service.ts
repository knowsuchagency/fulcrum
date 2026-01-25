import { nanoid } from 'nanoid'
import { eq, desc, and, sql, like, or } from 'drizzle-orm'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { db, chatSessions, chatMessages, artifacts } from '../db'
import type { ChatSession, NewChatSession, ChatMessage, NewChatMessage, Artifact, NewArtifact } from '../db/schema'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'
import {
  createChatWorktree,
  deleteChatWorktree,
  writeArtifactContent,
  createArtifactDir,
  startDevServer,
  stopDevServer,
} from './sandbox-service'
import type { PageContext } from '../../shared/types'

type ModelId = 'opus' | 'sonnet' | 'haiku'

const MODEL_MAP: Record<ModelId, string> = {
  opus: 'claude-opus-4-5',
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
}

// In-memory session state for Claude Agent SDK resume
const sessionState = new Map<string, { claudeSessionId?: string }>()

/**
 * Create a new chat session with worktree
 */
export async function createSession(options: {
  title?: string
  provider?: 'claude' | 'opencode'
  model?: string
  projectId?: string
  context?: PageContext
}): Promise<ChatSession> {
  const id = nanoid()
  const now = new Date().toISOString()

  // Create worktree for this session
  const { worktreePath, branch } = createChatWorktree(id)

  // Auto-start dev server for the sandbox
  let devPort: number | undefined
  try {
    devPort = await startDevServer(id, worktreePath)
    log.assistant.info('Dev server started for session', { sessionId: id, devPort })
  } catch (err) {
    log.assistant.warn('Failed to start dev server', {
      sessionId: id,
      error: err instanceof Error ? err.message : String(err),
    })
    // Continue without dev server - it can be started later
  }

  const session: NewChatSession = {
    id,
    title: options.title || 'New Chat',
    provider: options.provider || 'claude',
    model: options.model,
    worktreePath,
    branch,
    devPort,
    projectId: options.projectId,
    context: options.context ? JSON.stringify(options.context) : undefined,
    isFavorite: false,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(chatSessions).values(session).run()
  log.assistant.info('Created chat session', { sessionId: id, worktreePath, devPort })

  return db.select().from(chatSessions).where(eq(chatSessions.id, id)).get()!
}

/**
 * Get a session by ID
 */
export function getSession(id: string): ChatSession | null {
  return db.select().from(chatSessions).where(eq(chatSessions.id, id)).get() ?? null
}

/**
 * List sessions with pagination
 */
export function listSessions(options: {
  limit?: number
  offset?: number
  projectId?: string
  search?: string
  favorites?: boolean
}): { sessions: ChatSession[]; total: number } {
  const { limit = 50, offset = 0, projectId, search, favorites } = options

  let conditions = []

  if (projectId) {
    conditions.push(eq(chatSessions.projectId, projectId))
  }

  if (favorites) {
    conditions.push(eq(chatSessions.isFavorite, true))
  }

  if (search) {
    conditions.push(like(chatSessions.title, `%${search}%`))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const sessions = db
    .select()
    .from(chatSessions)
    .where(whereClause)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(limit)
    .offset(offset)
    .all()

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(chatSessions)
    .where(whereClause)
    .get()

  return {
    sessions,
    total: totalResult?.count ?? 0,
  }
}

/**
 * Update a session
 */
export function updateSession(id: string, updates: Partial<Pick<ChatSession, 'title' | 'isFavorite'>>): ChatSession | null {
  const session = getSession(id)
  if (!session) return null

  db.update(chatSessions)
    .set({
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(chatSessions.id, id))
    .run()

  return getSession(id)
}

/**
 * Delete a session and its worktree
 */
export function deleteSession(id: string): boolean {
  const session = getSession(id)
  if (!session) return false

  // Stop the dev server
  try {
    stopDevServer(id)
  } catch (err) {
    log.assistant.warn('Failed to stop dev server', { sessionId: id, error: String(err) })
  }

  // Delete associated artifacts
  db.delete(artifacts).where(eq(artifacts.sessionId, id)).run()

  // Delete messages
  db.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run()

  // Delete session
  db.delete(chatSessions).where(eq(chatSessions.id, id)).run()

  // Delete worktree
  try {
    deleteChatWorktree(session.worktreePath)
  } catch (err) {
    log.assistant.warn('Failed to delete worktree', { sessionId: id, error: String(err) })
  }

  // Clear in-memory state
  sessionState.delete(id)

  log.assistant.info('Deleted chat session', { sessionId: id })
  return true
}

/**
 * Add a message to a session
 */
export function addMessage(sessionId: string, message: Omit<NewChatMessage, 'id' | 'createdAt'>): ChatMessage {
  const id = nanoid()
  const now = new Date().toISOString()

  const newMessage: NewChatMessage = {
    ...message,
    id,
    sessionId,
    createdAt: now,
  }

  db.insert(chatMessages).values(newMessage).run()

  // Update session message count and timestamp
  db.update(chatSessions)
    .set({
      messageCount: sql`${chatSessions.messageCount} + 1`,
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(chatSessions.id, sessionId))
    .run()

  return db.select().from(chatMessages).where(eq(chatMessages.id, id)).get()!
}

/**
 * Get messages for a session
 */
export function getMessages(sessionId: string): ChatMessage[] {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
    .all()
}

/**
 * Build system prompt for assistant
 */
function buildSystemPrompt(session: ChatSession, context?: PageContext): string {
  let prompt = `You are an AI assistant integrated into Fulcrum, a terminal-first tool for orchestrating AI coding agents.

## Your Sandbox

You have a React project at: ${session.worktreePath}

Key files:
- src/App.tsx - Main component (edit this to show your creations)
- src/components/ - Create components here
- src/index.css - Tailwind styles

The sandbox includes:
- React 19 with TypeScript
- Tailwind CSS for styling
- Recharts for data visualization
- shadcn/ui components (Button, Card, Badge, Input, Tabs, etc.)

## Creating Visualizations

To create interactive visualizations, edit files directly in your sandbox:

1. **Edit src/App.tsx** to render your component
2. **Create new files** in src/components/ for complex components
3. The preview will auto-refresh (Vite HMR)

### Example: Creating a Chart

Use the \`write_file\` tool to update src/App.tsx:

\`\`\`tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { name: 'Jan', value: 400 },
  { name: 'Feb', value: 300 },
  { name: 'Mar', value: 600 },
  { name: 'Apr', value: 800 },
]

export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Sales Data</h1>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#8884d8" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
\`\`\`

## Available MCP Tools

Use the Fulcrum MCP tools to edit files in your sandbox:
- \`read_file\`: Read file content - use root="${session.worktreePath}"
- \`write_file\`: Write entire file - use root="${session.worktreePath}"
- \`edit_file\`: Replace specific strings - use root="${session.worktreePath}"

**Important**: Always use the full worktree path as the \`root\` parameter.

## Guidelines

- Always edit files directly using the MCP tools - the preview will auto-refresh
- Use Tailwind classes for styling (no need for separate CSS)
- Use Recharts components for charts: LineChart, BarChart, PieChart, AreaChart
- Keep components in src/App.tsx unless they're complex enough to warrant separate files
- Explain what your visualization shows`

  if (context) {
    prompt += `\n\n## Current Context\n- Page: ${context.path}`
    if (context.pageType) prompt += `\n- Page Type: ${context.pageType}`
    if (context.taskId) prompt += `\n- Task ID: ${context.taskId}`
    if (context.projectId) prompt += `\n- Project ID: ${context.projectId}`
  }

  return prompt
}

/**
 * Stream a message response
 */
export async function* streamMessage(
  sessionId: string,
  userMessage: string,
  modelId: ModelId = 'sonnet',
  context?: PageContext
): AsyncGenerator<{ type: string; data: unknown }> {
  const session = getSession(sessionId)
  if (!session) {
    yield { type: 'error', data: { message: 'Session not found' } }
    return
  }

  // Save user message
  addMessage(sessionId, {
    role: 'user',
    content: userMessage,
    sessionId,
  })

  const settings = getSettings()
  const port = settings.server.port

  // Get or create session state
  let state = sessionState.get(sessionId)
  if (!state) {
    state = {}
    sessionState.set(sessionId, state)
  }

  try {
    log.assistant.debug('Starting assistant query', {
      sessionId,
      hasResume: !!state.claudeSessionId,
    })

    const systemPrompt = buildSystemPrompt(session, context)

    const result = query({
      prompt: userMessage,
      options: {
        model: MODEL_MAP[modelId],
        resume: state.claudeSessionId,
        includePartialMessages: true,
        mcpServers: {
          fulcrum: {
            type: 'http',
            url: `http://localhost:${port}/mcp`,
          },
        },
        systemPrompt,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })

    let currentText = ''
    let tokensIn = 0
    let tokensOut = 0

    for await (const message of result) {
      if (message.type === 'stream_event') {
        const event = (message as { type: 'stream_event'; event: { type: string; delta?: { type: string; text?: string } } }).event

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          currentText += event.delta.text
          yield { type: 'content:delta', data: { text: event.delta.text } }
        }
      } else if (message.type === 'assistant') {
        const assistantMsg = message as { type: 'assistant'; session_id: string; message: { content: Array<{ type: string; text?: string }> } }
        state.claudeSessionId = assistantMsg.session_id

        const textContent = assistantMsg.message.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text)
          .join('')

        if (textContent) {
          if (textContent.length > currentText.length) {
            const remaining = textContent.slice(currentText.length)
            if (remaining) {
              yield { type: 'content:delta', data: { text: remaining } }
            }
          }

          // Extract and save artifacts
          const extractedArtifacts = await extractArtifacts(session, textContent)
          if (extractedArtifacts.length > 0) {
            yield { type: 'artifacts', data: { artifacts: extractedArtifacts } }
          }

          yield { type: 'message:complete', data: { content: textContent } }
        }
      } else if (message.type === 'result') {
        const resultMsg = message as { type: 'result'; subtype?: string; total_cost_usd?: number; is_error?: boolean; errors?: string[] }

        if (resultMsg.subtype?.startsWith('error_')) {
          const errors = resultMsg.errors || ['Unknown error']
          yield { type: 'error', data: { message: errors.join(', ') } }
        }

        log.assistant.debug('Query completed', { sessionId, cost: resultMsg.total_cost_usd })
      }
    }

    // Save assistant message
    addMessage(sessionId, {
      role: 'assistant',
      content: currentText,
      model: MODEL_MAP[modelId],
      tokensIn,
      tokensOut,
      sessionId,
    })

    yield { type: 'done', data: {} }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.assistant.error('Assistant stream error', { sessionId, error: errorMsg })
    yield { type: 'error', data: { message: errorMsg } }
  }
}

/**
 * Extract artifacts from assistant response
 */
async function extractArtifacts(session: ChatSession, content: string): Promise<Artifact[]> {
  const extracted: Artifact[] = []

  // React component pattern
  const reactPattern = /```react\n([\s\S]*?)```/g
  let match

  while ((match = reactPattern.exec(content)) !== null) {
    const code = match[1].trim()
    const artifact = await createArtifact({
      sessionId: session.id,
      type: 'react',
      title: extractTitle(code) || 'React Component',
      content: code,
      worktreePath: session.worktreePath,
    })
    extracted.push(artifact)
  }

  // Chart pattern
  const chartPattern = /```chart\n([\s\S]*?)```/g
  while ((match = chartPattern.exec(content)) !== null) {
    const config = match[1].trim()
    try {
      const parsed = JSON.parse(config)
      const artifact = await createArtifact({
        sessionId: session.id,
        type: 'chart',
        title: parsed.title || 'Chart',
        content: config,
        worktreePath: session.worktreePath,
      })
      extracted.push(artifact)
    } catch {
      log.assistant.warn('Failed to parse chart config')
    }
  }

  // Mermaid pattern
  const mermaidPattern = /```mermaid\n([\s\S]*?)```/g
  while ((match = mermaidPattern.exec(content)) !== null) {
    const diagram = match[1].trim()
    const artifact = await createArtifact({
      sessionId: session.id,
      type: 'mermaid',
      title: 'Diagram',
      content: diagram,
      worktreePath: session.worktreePath,
    })
    extracted.push(artifact)
  }

  // Fallback: Also detect json blocks that look like chart configs
  // (AI sometimes uses ```json instead of ```chart despite instructions)
  const jsonChartPattern = /```json\n([\s\S]*?)```/g
  while ((match = jsonChartPattern.exec(content)) !== null) {
    const config = match[1].trim()
    try {
      const parsed = JSON.parse(config)
      // Check if it looks like a chart config (has type and data array)
      if (parsed.type && parsed.data && Array.isArray(parsed.data)) {
        const artifact = await createArtifact({
          sessionId: session.id,
          type: 'chart',
          title: parsed.title || 'Chart',
          content: config,
          worktreePath: session.worktreePath,
        })
        extracted.push(artifact)
      }
    } catch {
      // Not valid JSON or not a chart, skip
    }
  }

  return extracted
}

/**
 * Extract title from React component code
 */
function extractTitle(code: string): string | null {
  // Try to find component name from export default
  const exportMatch = code.match(/export\s+default\s+function\s+(\w+)/)
  if (exportMatch) return exportMatch[1]

  // Try to find from const declaration
  const constMatch = code.match(/const\s+(\w+)\s*=/)
  if (constMatch) return constMatch[1]

  return null
}

/**
 * Create an artifact
 */
export async function createArtifact(options: {
  sessionId: string
  type: 'react' | 'chart' | 'mermaid' | 'markdown' | 'code'
  title: string
  content: string
  worktreePath: string
  description?: string
}): Promise<Artifact> {
  const id = nanoid()
  const now = new Date().toISOString()

  // Write content to worktree
  const contentPath = createArtifactDir(options.worktreePath, id)
  const filename = options.type === 'react' ? 'component.tsx' : options.type === 'chart' ? 'config.json' : 'content.txt'
  writeArtifactContent(options.worktreePath, id, filename, options.content)

  const artifact: NewArtifact = {
    id,
    sessionId: options.sessionId,
    type: options.type,
    title: options.title,
    description: options.description,
    contentPath,
    version: 1,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(artifacts).values(artifact).run()
  log.assistant.info('Created artifact', { artifactId: id, type: options.type })

  return db.select().from(artifacts).where(eq(artifacts.id, id)).get()!
}

/**
 * Get an artifact by ID
 */
export function getArtifact(id: string): Artifact | null {
  return db.select().from(artifacts).where(eq(artifacts.id, id)).get() ?? null
}

/**
 * List artifacts
 */
export function listArtifacts(options: {
  sessionId?: string
  type?: string
  favorites?: boolean
  limit?: number
  offset?: number
}): { artifacts: Artifact[]; total: number } {
  const { sessionId, type, favorites, limit = 50, offset = 0 } = options

  let conditions = []

  if (sessionId) {
    conditions.push(eq(artifacts.sessionId, sessionId))
  }

  if (type) {
    conditions.push(eq(artifacts.type, type))
  }

  if (favorites) {
    conditions.push(eq(artifacts.isFavorite, true))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const results = db
    .select()
    .from(artifacts)
    .where(whereClause)
    .orderBy(desc(artifacts.createdAt))
    .limit(limit)
    .offset(offset)
    .all()

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(artifacts)
    .where(whereClause)
    .get()

  return {
    artifacts: results,
    total: totalResult?.count ?? 0,
  }
}

/**
 * Update an artifact
 */
export function updateArtifact(id: string, updates: Partial<Pick<Artifact, 'title' | 'description' | 'isFavorite' | 'tags'>>): Artifact | null {
  const artifact = getArtifact(id)
  if (!artifact) return null

  db.update(artifacts)
    .set({
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(artifacts.id, id))
    .run()

  return getArtifact(id)
}

/**
 * Delete an artifact
 */
export function deleteArtifact(id: string): boolean {
  const artifact = getArtifact(id)
  if (!artifact) return false

  db.delete(artifacts).where(eq(artifacts.id, id)).run()
  log.assistant.info('Deleted artifact', { artifactId: id })

  return true
}

/**
 * Fork an artifact to a new version
 */
export async function forkArtifact(id: string, newContent: string): Promise<Artifact | null> {
  const original = getArtifact(id)
  if (!original) return null

  const session = getSession(original.sessionId!)
  if (!session) return null

  return createArtifact({
    sessionId: session.id,
    type: original.type as 'react' | 'chart' | 'mermaid' | 'markdown' | 'code',
    title: `${original.title} (v${(original.version || 1) + 1})`,
    content: newContent,
    worktreePath: session.worktreePath,
    description: original.description || undefined,
  })
}
