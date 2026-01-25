import { nanoid } from 'nanoid'
import { eq, desc, and, sql, like, isNotNull } from 'drizzle-orm'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { db, chatSessions, chatMessages, artifacts } from '../db'
import type { ChatSession, NewChatSession, ChatMessage, NewChatMessage, Artifact, NewArtifact } from '../db/schema'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'
import type { PageContext } from '../../shared/types'
import { saveDocument, readDocument, deleteDocument, renameDocument, generateDocumentFilename } from './document-service'

type ModelId = 'opus' | 'sonnet' | 'haiku'

const MODEL_MAP: Record<ModelId, string> = {
  opus: 'claude-opus-4-5',
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
}

// In-memory session state for Claude Agent SDK resume
const sessionState = new Map<string, { claudeSessionId?: string }>()

/**
 * Create a new chat session
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

  const session: NewChatSession = {
    id,
    title: options.title || 'New Chat',
    provider: options.provider || 'claude',
    model: options.model,
    projectId: options.projectId,
    context: options.context ? JSON.stringify(options.context) : undefined,
    isFavorite: false,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  db.insert(chatSessions).values(session).run()
  log.assistant.info('Created chat session', { sessionId: id })

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
export function updateSession(
  id: string,
  updates: Partial<Pick<ChatSession, 'title' | 'isFavorite' | 'editorContent' | 'documentPath' | 'documentStarred'>>
): ChatSession | null {
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
 * Delete a session and its data
 */
export async function deleteSession(id: string): Promise<boolean> {
  const session = getSession(id)
  if (!session) return false

  // Delete document file if exists
  if (session.documentPath) {
    try {
      await deleteDocument(session.documentPath)
    } catch (err) {
      log.assistant.warn('Failed to delete document file', {
        sessionId: id,
        documentPath: session.documentPath,
        error: String(err),
      })
    }
  }

  // Delete associated artifacts
  db.delete(artifacts).where(eq(artifacts.sessionId, id)).run()

  // Delete messages
  db.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run()

  // Delete session
  db.delete(chatSessions).where(eq(chatSessions.id, id)).run()

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
function buildSystemPrompt(): string {
  const basePrompt = `You are an AI assistant integrated into Fulcrum, a terminal-first tool for orchestrating AI coding agents.

## Canvas Tool

You have a canvas panel on the right side of the chat. Use <canvas> XML tags to display content in the viewer:

<canvas>
Content to display in the canvas viewer.
This can include markdown, tables, code blocks, charts, etc.
</canvas>

**When to use the canvas:**
- When the user asks you to "show", "display", "visualize", or "render" something
- When creating charts, diagrams, or formatted output
- When the output would benefit from being displayed in a dedicated panel

**When NOT to use the canvas:**
- For simple text responses or explanations
- When just answering questions conversationally

## Creating Charts

Inside canvas blocks (or standalone), you can use Recharts components:

### Creating Charts with Recharts

Use fenced code blocks with the \`chart\` language identifier. Write JSX using Recharts components:

\`\`\`chart
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={[
    { category: 'A', value: 28 },
    { category: 'B', value: 55 },
    { category: 'C', value: 43 }
  ]}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis dataKey="category" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
    <YAxis stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', borderRadius: '8px' }} />
    <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
\`\`\`

### Available Chart Components

All Recharts components are available:
- **BarChart, Bar** - Bar charts (horizontal/vertical)
- **LineChart, Line** - Line charts
- **AreaChart, Area** - Area charts
- **PieChart, Pie, Cell** - Pie/donut charts
- **ScatterChart, Scatter** - Scatter plots
- **RadarChart, Radar** - Radar charts
- **ComposedChart** - Mixed chart types
- **ResponsiveContainer** - Responsive wrapper (always use this)
- **CartesianGrid, XAxis, YAxis, Tooltip, Legend** - Chart accessories

### Example: Multi-series Line Chart

\`\`\`chart
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={[
    { month: 'Jan', productA: 100, productB: 80 },
    { month: 'Feb', productA: 150, productB: 120 },
    { month: 'Mar', productA: 130, productB: 140 }
  ]}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis dataKey="month" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
    <YAxis stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />
    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', borderRadius: '8px' }} />
    <Legend wrapperStyle={{ color: 'var(--muted-foreground)' }} />
    <Line type="monotone" dataKey="productA" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} />
    <Line type="monotone" dataKey="productB" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4 }} />
  </LineChart>
</ResponsiveContainer>
\`\`\`

### Example: Pie Chart

\`\`\`chart
<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={[
        { name: 'Group A', value: 400 },
        { name: 'Group B', value: 300 },
        { name: 'Group C', value: 200 }
      ]}
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={100}
      paddingAngle={2}
      dataKey="value"
    >
      <Cell fill="var(--chart-1)" />
      <Cell fill="var(--chart-2)" />
      <Cell fill="var(--chart-3)" />
    </Pie>
    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', borderRadius: '8px' }} />
    <Legend wrapperStyle={{ color: 'var(--muted-foreground)' }} />
  </PieChart>
</ResponsiveContainer>
\`\`\`

## Color Palette (CSS Variables)

ALWAYS use these CSS variables for colors - they adapt to light/dark themes:

**Data colors (for bars, lines, areas, pie slices):**
- \`var(--chart-1)\` - Primary accent (blue)
- \`var(--chart-2)\` - Secondary accent (teal)
- \`var(--chart-3)\` - Tertiary accent (amber)
- \`var(--chart-4)\` - Fourth accent (rose)
- \`var(--chart-5)\` - Fifth accent (violet)

**UI colors:**
- \`var(--foreground)\` - Primary text color
- \`var(--muted-foreground)\` - Secondary text (axis labels, legends)
- \`var(--border)\` - Grid lines, borders
- \`var(--card)\` - Tooltip/card backgrounds
- \`var(--card-foreground)\` - Text on cards/tooltips

**Usage pattern:**
\`\`\`jsx
// Bars, lines, fills - use chart colors
<Bar fill="var(--chart-1)" />
<Line stroke="var(--chart-2)" />

// Axis text - use muted foreground
<XAxis stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)' }} />

// Grid - use border
<CartesianGrid stroke="var(--border)" />

// Tooltips - use card colors
<Tooltip contentStyle={{ backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)' }} />
\`\`\`

## Styling Rules

- Always wrap charts in ResponsiveContainer with width="100%" and height={300}
- Use strokeWidth={2} for lines
- Use radius={[4, 4, 0, 0]} for rounded bar tops
- Use strokeDasharray="3 3" for grid lines

## Markdown Formatting

Use standard markdown for explanatory text. After the chart, explain key insights or patterns.

## Editor Context

The user may have a document open in the Editor tab. When present, you'll see it in <editor_content> tags before their message.

**IMPORTANT: To update the editor, use <editor> XML tags.**

When the user asks you to help with, edit, fix, improve, or modify their document in any way, output the corrected/updated content wrapped in editor tags:

<editor>
The complete updated document content goes here.
</editor>

This will automatically update the editor. Always provide the COMPLETE document, not just the changes.

**Example - User asks "fix my spelling":**

<editor>
Where in the world is Carmen Sandiego?
</editor>

**When to use <editor> tags:**
- Fixing spelling, grammar, or typos
- Rewriting or improving text
- Adding new content
- Any request that involves changing the document

After the editor tags, you can explain what changes you made.`

  // Add custom instructions from settings if configured
  const settings = getSettings()
  const customInstructions = settings.assistant.customInstructions
  if (customInstructions) {
    return basePrompt + `

## Custom Instructions

${customInstructions}`
  }

  return basePrompt
}

/**
 * Stream a message response
 */
export async function* streamMessage(
  sessionId: string,
  userMessage: string,
  modelId?: ModelId,
  editorContent?: string
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

  // Use provided model or fall back to default from settings
  const effectiveModelId: ModelId = modelId ?? settings.assistant.model

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
      hasEditorContent: !!editorContent,
    })

    const systemPrompt = buildSystemPrompt()

    // Build the full prompt, including editor content if present
    let fullPrompt = userMessage
    if (editorContent && editorContent.trim()) {
      fullPrompt = `<editor_content>
${editorContent}
</editor_content>

User message: ${userMessage}`
    }

    const result = query({
      prompt: fullPrompt,
      options: {
        model: MODEL_MAP[effectiveModelId],
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
          const extractedArtifacts = await extractArtifacts(sessionId, textContent)
          if (extractedArtifacts.length > 0) {
            yield { type: 'artifacts', data: { artifacts: extractedArtifacts } }
          }

          // Extract document updates
          const documentContent = extractDocumentContent(textContent)
          log.assistant.debug('Document extraction check', {
            sessionId,
            hasDocument: !!documentContent,
            textPreview: textContent.slice(0, 100),
          })
          if (documentContent) {
            log.assistant.info('Sending document event', { sessionId, content: documentContent })
            yield { type: 'document', data: { content: documentContent } }
          }

          // Extract canvas content (explicit viewer display)
          const canvasContent = extractCanvasContent(textContent)
          if (canvasContent) {
            log.assistant.info('Sending canvas event', { sessionId, contentPreview: canvasContent.slice(0, 100) })
            yield { type: 'canvas', data: { content: canvasContent } }
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
      model: MODEL_MAP[effectiveModelId],
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
 * Extract editor content from assistant response
 * Looks for <editor> XML tags
 */
function extractDocumentContent(content: string): string | null {
  // Match <editor>...</editor> tags
  const pattern = /<editor>\s*([\s\S]*?)\s*<\/editor>/g
  const match = pattern.exec(content)
  if (match) {
    return match[1].trim()
  }
  return null
}

/**
 * Extract canvas content from assistant response
 * Looks for <canvas> XML tags
 */
function extractCanvasContent(content: string): string | null {
  // Match <canvas>...</canvas> tags
  const pattern = /<canvas>\s*([\s\S]*?)\s*<\/canvas>/g
  const match = pattern.exec(content)
  if (match) {
    return match[1].trim()
  }
  return null
}

/**
 * Extract artifacts from assistant response
 */
async function extractArtifacts(sessionId: string, content: string): Promise<Artifact[]> {
  const extracted: Artifact[] = []
  let match

  // Chart/MDX pattern - Recharts JSX in ```chart blocks
  const chartPattern = /```(?:chart|mdx-chart)\s*([\s\S]*?)```/g
  let chartIndex = 1
  while ((match = chartPattern.exec(content)) !== null) {
    const chartContent = match[1].trim()
    if (chartContent) {
      const artifact = await createArtifact({
        sessionId,
        type: 'chart',
        title: `Chart ${chartIndex++}`,
        content: chartContent,
      })
      extracted.push(artifact)
    }
  }

  // Mermaid pattern
  const mermaidPattern = /```mermaid\n([\s\S]*?)```/g
  while ((match = mermaidPattern.exec(content)) !== null) {
    const diagram = match[1].trim()
    const artifact = await createArtifact({
      sessionId,
      type: 'mermaid',
      title: 'Diagram',
      content: diagram,
    })
    extracted.push(artifact)
  }

  return extracted
}

/**
 * Create an artifact
 */
export async function createArtifact(options: {
  sessionId: string
  type: 'chart' | 'mermaid' | 'markdown' | 'code'
  title: string
  content: string
  description?: string
}): Promise<Artifact> {
  const id = nanoid()
  const now = new Date().toISOString()

  const artifact: NewArtifact = {
    id,
    sessionId: options.sessionId,
    type: options.type,
    title: options.title,
    description: options.description,
    content: options.content,
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

  if (!original.sessionId) return null

  return createArtifact({
    sessionId: original.sessionId,
    type: original.type as 'chart' | 'mermaid' | 'markdown' | 'code',
    title: `${original.title} (v${(original.version || 1) + 1})`,
    content: newContent,
    description: original.description || undefined,
  })
}

// ==================== Document Functions ====================

export interface Document {
  sessionId: string
  sessionTitle: string
  filename: string
  starred: boolean
  content: string | null
  updatedAt: string
}

/**
 * Save editor content as a document file
 * Creates a new document if session doesn't have one, or updates existing
 */
export async function saveSessionDocument(
  sessionId: string,
  content: string
): Promise<string | null> {
  const session = getSession(sessionId)
  if (!session) return null

  let docPath = session.documentPath

  // Generate filename if session doesn't have a document yet
  if (!docPath) {
    docPath = generateDocumentFilename(session.title)
  }

  // Save to filesystem
  await saveDocument(docPath, content)

  // Update session with document path if new
  if (!session.documentPath) {
    updateSession(sessionId, { documentPath: docPath })
  }

  log.assistant.info('Saved session document', { sessionId, documentPath: docPath })
  return docPath
}

/**
 * List all documents (sessions that have a document)
 * Sorted by starred first, then by updatedAt
 */
export async function listDocuments(): Promise<Document[]> {
  const sessions = db
    .select()
    .from(chatSessions)
    .where(isNotNull(chatSessions.documentPath))
    .orderBy(
      desc(chatSessions.documentStarred),
      desc(chatSessions.updatedAt)
    )
    .all()

  const documents: Document[] = await Promise.all(
    sessions.map(async (session) => ({
      sessionId: session.id,
      sessionTitle: session.title,
      filename: session.documentPath!,
      starred: session.documentStarred ?? false,
      content: await readDocument(session.documentPath!),
      updatedAt: session.updatedAt,
    }))
  )

  return documents
}

/**
 * Rename a document
 */
export async function renameSessionDocument(
  sessionId: string,
  newFilename: string
): Promise<boolean> {
  const session = getSession(sessionId)
  if (!session?.documentPath) return false

  // Ensure new filename has .md extension
  const normalizedFilename = newFilename.endsWith('.md')
    ? newFilename
    : `${newFilename}.md`

  // Rename file on disk
  await renameDocument(session.documentPath, normalizedFilename)

  // Update session
  updateSession(sessionId, { documentPath: normalizedFilename })

  log.assistant.info('Renamed document', {
    sessionId,
    from: session.documentPath,
    to: normalizedFilename,
  })

  return true
}

/**
 * Toggle document starred status
 */
export function toggleDocumentStarred(sessionId: string): boolean {
  const session = getSession(sessionId)
  if (!session?.documentPath) return false

  const newStarred = !session.documentStarred
  updateSession(sessionId, { documentStarred: newStarred })

  log.assistant.info('Toggled document starred', { sessionId, starred: newStarred })
  return newStarred
}

/**
 * Remove document from session (deletes file, clears document fields)
 */
export async function removeSessionDocument(sessionId: string): Promise<boolean> {
  const session = getSession(sessionId)
  if (!session?.documentPath) return false

  // Delete file
  await deleteDocument(session.documentPath)

  // Clear document fields
  db.update(chatSessions)
    .set({
      documentPath: null,
      documentStarred: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(chatSessions.id, sessionId))
    .run()

  log.assistant.info('Removed session document', { sessionId })
  return true
}
