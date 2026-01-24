import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createSession, endSession, streamMessage, getSessionInfo } from '../services/chat-service'

const chatRoutes = new Hono()

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
chatRoutes.post('/sessions', async (c) => {
  const body = await c.req.json<{ taskId?: string }>().catch(() => ({}))
  const sessionId = createSession(body.taskId)
  return c.json({ sessionId })
})

/**
 * GET /api/chat/:sessionId
 * Get session info
 */
chatRoutes.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const info = getSessionInfo(sessionId)

  if (!info) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json(info)
})

/**
 * POST /api/chat/:sessionId/messages
 * Send a message and stream the response via SSE
 */
chatRoutes.post('/:sessionId/messages', async (c) => {
  const sessionId = c.req.param('sessionId')
  const { message } = await c.req.json<{ message: string }>()

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'Message is required' }, 400)
  }

  const info = getSessionInfo(sessionId)
  if (!info) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    for await (const event of streamMessage(sessionId, message)) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.data),
      })
    }
  })
})

/**
 * DELETE /api/chat/:sessionId
 * End a chat session
 */
chatRoutes.delete('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const success = endSession(sessionId)

  if (!success) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json({ success: true })
})

export default chatRoutes
