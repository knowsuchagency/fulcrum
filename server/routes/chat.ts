import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createSession, endSession, streamMessage, getSessionInfo } from '../services/chat-service'
import {
  createOpencodeSession,
  endOpencodeSession,
  streamOpencodeMessage,
  getOpencodeSessionInfo,
} from '../services/opencode-chat-service'
import type { PageContext } from '../../shared/types'

export type ChatProvider = 'claude' | 'opencode'

const chatRoutes = new Hono()

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
chatRoutes.post('/sessions', async (c) => {
  const { provider = 'claude' } = await c.req.json<{ provider?: ChatProvider }>().catch(() => ({}))

  const sessionId = provider === 'opencode' ? createOpencodeSession() : createSession()
  return c.json({ sessionId, provider })
})

/**
 * GET /api/chat/:sessionId
 * Get session info
 */
chatRoutes.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const provider = c.req.query('provider') as ChatProvider | undefined

  // Try both providers if not specified
  const info =
    provider === 'opencode'
      ? getOpencodeSessionInfo(sessionId)
      : provider === 'claude'
        ? getSessionInfo(sessionId)
        : getSessionInfo(sessionId) || getOpencodeSessionInfo(sessionId)

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
  const { message, model, context, provider = 'claude' } = await c.req.json<{
    message: string
    model?: string
    context?: PageContext
    provider?: ChatProvider
  }>()

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'Message is required' }, 400)
  }

  // Check session exists based on provider
  if (provider === 'opencode') {
    const info = getOpencodeSessionInfo(sessionId)
    if (!info) {
      return c.json({ error: 'Session not found' }, 404)
    }

    return streamSSE(c, async (stream) => {
      for await (const event of streamOpencodeMessage(sessionId, message, model, context)) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
      }
    })
  }

  // Default to Claude
  const info = getSessionInfo(sessionId)
  if (!info) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    for await (const event of streamMessage(
      sessionId,
      message,
      model as 'opus' | 'sonnet' | 'haiku' | undefined,
      context
    )) {
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
  const { provider } = await c.req.json<{ provider?: ChatProvider }>().catch(() => ({}))

  // Try both providers if not specified
  let success = false
  if (provider === 'opencode') {
    success = endOpencodeSession(sessionId)
  } else if (provider === 'claude') {
    success = endSession(sessionId)
  } else {
    success = endSession(sessionId) || endOpencodeSession(sessionId)
  }

  if (!success) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json({ success: true })
})

export default chatRoutes
