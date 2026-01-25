import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import * as assistantService from '../services/assistant-service'
import type { PageContext } from '../../shared/types'

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
  const updates = await c.req.json<{ title?: string; isFavorite?: boolean }>()

  const session = assistantService.updateSession(id, updates)
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
  const success = assistantService.deleteSession(id)

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
  const { message, model } = await c.req.json<{
    message: string
    model?: 'opus' | 'sonnet' | 'haiku'
  }>()

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'Message is required' }, 400)
  }

  const session = assistantService.getSession(sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    for await (const event of assistantService.streamMessage(sessionId, message, model)) {
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

export default assistantRoutes
