import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { actionableEvents, sweepRuns, tasks } from '../db/schema'
import { eq, desc, sql, and, count } from 'drizzle-orm'
import * as assistantService from '../services/assistant-service'
import type { PageContext } from '../../shared/types'
import type { ImageData } from './chat'

const assistantRoutes = new Hono()

/**
 * POST /api/assistant/sessions
 * Create a new chat session
 */
assistantRoutes.post('/sessions', async (c) => {
  const body = await c.req.json<{
    title?: string
    provider?: 'claude' | 'opencode'
    model?: string
    projectId?: string
    context?: PageContext
  }>().catch(() => ({}))

  try {
    const session = await assistantService.createSession(body)
    return c.json(session)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/sessions
 * List sessions with pagination
 */
assistantRoutes.get('/sessions', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')
  const projectId = c.req.query('projectId') || undefined
  const search = c.req.query('search') || undefined
  const favorites = c.req.query('favorites') === 'true'

  const result = assistantService.listSessions({ limit, offset, projectId, search, favorites })
  return c.json(result)
})

/**
 * GET /api/assistant/sessions/:id
 * Get a session with messages
 */
assistantRoutes.get('/sessions/:id', async (c) => {
  const id = c.req.param('id')
  const session = assistantService.getSession(id)

  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const messages = assistantService.getMessages(id)
  return c.json({ ...session, messages })
})

/**
 * PATCH /api/assistant/sessions/:id
 * Update a session
 */
assistantRoutes.patch('/sessions/:id', async (c) => {
  const id = c.req.param('id')
  const updates = await c.req.json<{
    title?: string
    isFavorite?: boolean
    editorContent?: string
    saveDocument?: boolean
  }>()

  // If saveDocument is true and there's editorContent, also save to file
  if (updates.saveDocument && updates.editorContent) {
    await assistantService.saveSessionDocument(id, updates.editorContent)
  }

  const session = assistantService.updateSession(id, {
    title: updates.title,
    isFavorite: updates.isFavorite,
    editorContent: updates.editorContent,
  })
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json(session)
})

/**
 * DELETE /api/assistant/sessions/:id
 * Delete a session
 */
assistantRoutes.delete('/sessions/:id', async (c) => {
  const id = c.req.param('id')
  const success = await assistantService.deleteSession(id)

  if (!success) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json({ success: true })
})

/**
 * POST /api/assistant/sessions/:id/messages
 * Send a message and stream the response via SSE
 */
assistantRoutes.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id')
  const { message, model, editorContent, images, context } = await c.req.json<{
    message: string
    model?: 'opus' | 'sonnet' | 'haiku'
    editorContent?: string
    images?: ImageData[]
    context?: PageContext
  }>()

  // Allow empty message if images are present
  if ((!message || typeof message !== 'string') && (!images || images.length === 0)) {
    return c.json({ error: 'Message or images required' }, 400)
  }

  const session = assistantService.getSession(sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    for await (const event of assistantService.streamMessage(sessionId, message || '', {
      modelId: model,
      editorContent,
      images,
      context,
    })) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.data),
      })
    }
  })
})

/**
 * GET /api/assistant/artifacts
 * List artifacts
 */
assistantRoutes.get('/artifacts', async (c) => {
  const sessionId = c.req.query('sessionId') || undefined
  const type = c.req.query('type') || undefined
  const favorites = c.req.query('favorites') === 'true'
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  const result = assistantService.listArtifacts({ sessionId, type, favorites, limit, offset })
  return c.json(result)
})

/**
 * GET /api/assistant/artifacts/:id
 * Get an artifact with content
 */
assistantRoutes.get('/artifacts/:id', async (c) => {
  const id = c.req.param('id')
  const artifact = assistantService.getArtifact(id)

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404)
  }

  return c.json(artifact)
})

/**
 * POST /api/assistant/artifacts
 * Create an artifact manually
 */
assistantRoutes.post('/artifacts', async (c) => {
  const body = await c.req.json<{
    sessionId: string
    type: 'vega-lite' | 'mermaid' | 'markdown' | 'code'
    title: string
    content: string
    description?: string
  }>()

  const session = assistantService.getSession(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  try {
    const artifact = await assistantService.createArtifact({
      sessionId: body.sessionId,
      type: body.type,
      title: body.title,
      content: body.content,
      description: body.description,
    })
    return c.json(artifact)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * PATCH /api/assistant/artifacts/:id
 * Update an artifact
 */
assistantRoutes.patch('/artifacts/:id', async (c) => {
  const id = c.req.param('id')
  const updates = await c.req.json<{
    title?: string
    description?: string
    isFavorite?: boolean
    tags?: string
  }>()

  const artifact = assistantService.updateArtifact(id, updates)
  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404)
  }

  return c.json(artifact)
})

/**
 * DELETE /api/assistant/artifacts/:id
 * Delete an artifact
 */
assistantRoutes.delete('/artifacts/:id', async (c) => {
  const id = c.req.param('id')
  const success = assistantService.deleteArtifact(id)

  if (!success) {
    return c.json({ error: 'Artifact not found' }, 404)
  }

  return c.json({ success: true })
})

/**
 * POST /api/assistant/artifacts/:id/fork
 * Fork an artifact to a new version
 */
assistantRoutes.post('/artifacts/:id/fork', async (c) => {
  const id = c.req.param('id')
  const { content } = await c.req.json<{ content: string }>()

  if (!content) {
    return c.json({ error: 'Content is required' }, 400)
  }

  const artifact = await assistantService.forkArtifact(id, content)
  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404)
  }

  return c.json(artifact)
})

// ==================== Document Routes ====================

/**
 * GET /api/assistant/documents
 * List all documents (sessions with saved documents)
 */
assistantRoutes.get('/documents', async (c) => {
  try {
    const documents = await assistantService.listDocuments()
    return c.json({ documents })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * POST /api/assistant/documents/:sessionId
 * Save document content for a session
 */
assistantRoutes.post('/documents/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const { content } = await c.req.json<{ content: string }>()

  if (content === undefined) {
    return c.json({ error: 'Content is required' }, 400)
  }

  try {
    const documentPath = await assistantService.saveSessionDocument(sessionId, content)
    if (!documentPath) {
      return c.json({ error: 'Session not found' }, 404)
    }
    return c.json({ success: true, documentPath })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * PATCH /api/assistant/documents/:sessionId
 * Update document metadata (rename or toggle starred)
 */
assistantRoutes.patch('/documents/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const { filename, starred } = await c.req.json<{
    filename?: string
    starred?: boolean
  }>()

  const session = assistantService.getSession(sessionId)
  if (!session?.documentPath) {
    return c.json({ error: 'No document for this session' }, 404)
  }

  try {
    // Rename if filename provided and different
    if (filename && filename !== session.documentPath) {
      await assistantService.renameSessionDocument(sessionId, filename)
    }

    // Toggle starred if provided
    if (typeof starred === 'boolean') {
      assistantService.updateSession(sessionId, { documentStarred: starred })
    }

    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * DELETE /api/assistant/documents/:sessionId
 * Delete document from session (keeps session, removes document)
 */
assistantRoutes.delete('/documents/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  try {
    const success = await assistantService.removeSessionDocument(sessionId)
    if (!success) {
      return c.json({ error: 'No document for this session' }, 404)
    }
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

// ==================== Events & Sweeps Routes ====================

/**
 * GET /api/assistant/events
 * List actionable events with optional filtering
 */
assistantRoutes.get('/events', async (c) => {
  const status = c.req.query('status')
  const channel = c.req.query('channel')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const conditions = []
    if (status) {
      conditions.push(eq(actionableEvents.status, status))
    }
    if (channel) {
      conditions.push(eq(actionableEvents.sourceChannel, channel))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const events = db
      .select()
      .from(actionableEvents)
      .where(whereClause)
      .orderBy(desc(actionableEvents.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    const [{ total }] = db
      .select({ total: count() })
      .from(actionableEvents)
      .where(whereClause)
      .all()

    return c.json({ events, total })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/events/:id
 * Get single event with linked task details
 */
assistantRoutes.get('/events/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const event = db.select().from(actionableEvents).where(eq(actionableEvents.id, id)).get()

    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    // Include linked task if present
    let linkedTask = null
    if (event.linkedTaskId) {
      linkedTask = db.select().from(tasks).where(eq(tasks.id, event.linkedTaskId)).get()
    }

    return c.json({ ...event, linkedTask })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * POST /api/assistant/events
 * Create a new actionable event
 */
assistantRoutes.post('/events', async (c) => {
  const body = await c.req.json<{
    sourceChannel: string
    sourceId: string
    sourceMetadata?: Record<string, unknown>
    summary?: string
    status?: 'pending' | 'acted_upon' | 'dismissed' | 'monitoring'
    linkedTaskId?: string
  }>()

  if (!body.sourceChannel || !body.sourceId) {
    return c.json({ error: 'sourceChannel and sourceId are required' }, 400)
  }

  try {
    const now = new Date().toISOString()
    const event = {
      id: nanoid(),
      sourceChannel: body.sourceChannel,
      sourceId: body.sourceId,
      sourceMetadata: body.sourceMetadata,
      summary: body.summary,
      status: body.status || 'pending',
      linkedTaskId: body.linkedTaskId,
      actionLog: [],
      createdAt: now,
      updatedAt: now,
    }

    db.insert(actionableEvents).values(event).run()
    return c.json(event, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * PATCH /api/assistant/events/:id
 * Update an actionable event
 */
assistantRoutes.patch('/events/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    status?: 'pending' | 'acted_upon' | 'dismissed' | 'monitoring'
    linkedTaskId?: string | null
    actionLogEntry?: string
  }>()

  try {
    const existing = db.select().from(actionableEvents).where(eq(actionableEvents.id, id)).get()

    if (!existing) {
      return c.json({ error: 'Event not found' }, 404)
    }

    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { updatedAt: now }

    if (body.status !== undefined) {
      updates.status = body.status
    }

    if (body.linkedTaskId !== undefined) {
      updates.linkedTaskId = body.linkedTaskId
    }

    if (body.actionLogEntry) {
      const existingLog = existing.actionLog || []
      updates.actionLog = [...existingLog, { timestamp: now, action: body.actionLogEntry }]
    }

    db.update(actionableEvents).set(updates).where(eq(actionableEvents.id, id)).run()

    const updated = db.select().from(actionableEvents).where(eq(actionableEvents.id, id)).get()
    return c.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * DELETE /api/assistant/events/:id
 * Delete an actionable event
 */
assistantRoutes.delete('/events/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(actionableEvents).where(eq(actionableEvents.id, id)).get()

    if (!existing) {
      return c.json({ error: 'Event not found' }, 404)
    }

    db.delete(actionableEvents).where(eq(actionableEvents.id, id)).run()
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/sweeps
 * List sweep runs with optional filtering
 */
assistantRoutes.get('/sweeps', async (c) => {
  const type = c.req.query('type')
  const limit = parseInt(c.req.query('limit') || '20')

  try {
    const whereClause = type ? eq(sweepRuns.type, type) : undefined

    const runs = db
      .select()
      .from(sweepRuns)
      .where(whereClause)
      .orderBy(desc(sweepRuns.startedAt))
      .limit(limit)
      .all()

    return c.json({ runs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/sweeps/last/:type
 * Get the most recent sweep run of a specific type
 */
assistantRoutes.get('/sweeps/last/:type', async (c) => {
  const type = c.req.param('type')

  try {
    const sweep = db
      .select()
      .from(sweepRuns)
      .where(eq(sweepRuns.type, type))
      .orderBy(desc(sweepRuns.completedAt))
      .limit(1)
      .get()

    return c.json(sweep || null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/sweeps/:id
 * Get single sweep run details
 */
assistantRoutes.get('/sweeps/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const sweep = db.select().from(sweepRuns).where(eq(sweepRuns.id, id)).get()

    if (!sweep) {
      return c.json({ error: 'Sweep not found' }, 404)
    }

    return c.json(sweep)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/assistant/stats
 * Get assistant statistics for dashboard
 */
assistantRoutes.get('/stats', async (c) => {
  try {
    // Count events by status
    const eventCounts = db
      .select({
        status: actionableEvents.status,
        count: count(),
      })
      .from(actionableEvents)
      .groupBy(actionableEvents.status)
      .all()

    const eventStats = {
      pending: 0,
      actedUpon: 0,
      dismissed: 0,
      monitoring: 0,
      total: 0,
    }

    for (const row of eventCounts) {
      const cnt = Number(row.count)
      eventStats.total += cnt
      if (row.status === 'pending') eventStats.pending = cnt
      else if (row.status === 'acted_upon') eventStats.actedUpon = cnt
      else if (row.status === 'dismissed') eventStats.dismissed = cnt
      else if (row.status === 'monitoring') eventStats.monitoring = cnt
    }

    // Get last sweep time for each type
    const lastSweeps = {
      hourly: null as string | null,
      morningRitual: null as string | null,
      eveningRitual: null as string | null,
    }

    const latestSweeps = db
      .select({
        type: sweepRuns.type,
        completedAt: sql<string>`MAX(${sweepRuns.completedAt})`.as('completedAt'),
      })
      .from(sweepRuns)
      .where(eq(sweepRuns.status, 'completed'))
      .groupBy(sweepRuns.type)
      .all()

    for (const sweep of latestSweeps) {
      if (sweep.type === 'hourly') lastSweeps.hourly = sweep.completedAt
      else if (sweep.type === 'morning_ritual') lastSweeps.morningRitual = sweep.completedAt
      else if (sweep.type === 'evening_ritual') lastSweeps.eveningRitual = sweep.completedAt
    }

    return c.json({
      events: eventStats,
      lastSweeps,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

export default assistantRoutes
