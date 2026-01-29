import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db } from '../db'
import { actionableEvents, sweepRuns } from '../db/schema'
import { eq } from 'drizzle-orm'

describe('Assistant Events Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/assistant/events', () => {
    test('returns empty array when no events exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/assistant/events')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.events).toEqual([])
      expect(body.total).toBe(0)
    })

    test('returns all events ordered by created date desc', async () => {
      const now = new Date().toISOString()
      const earlier = new Date(Date.now() - 1000).toISOString()

      db.insert(actionableEvents)
        .values([
          {
            id: 'event-1',
            sourceChannel: 'whatsapp',
            sourceId: 'msg-1',
            summary: 'First event',
            status: 'pending',
            createdAt: earlier,
            updatedAt: earlier,
          },
          {
            id: 'event-2',
            sourceChannel: 'email',
            sourceId: 'msg-2',
            summary: 'Second event',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/events')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.events.length).toBe(2)
      expect(body.events[0].id).toBe('event-2') // Most recent first
      expect(body.events[1].id).toBe('event-1')
      expect(body.total).toBe(2)
    })

    test('filters by status', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values([
          {
            id: 'event-1',
            sourceChannel: 'whatsapp',
            sourceId: 'msg-1',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'event-2',
            sourceChannel: 'whatsapp',
            sourceId: 'msg-2',
            status: 'acted_upon',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/events?status=pending')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.events.length).toBe(1)
      expect(body.events[0].id).toBe('event-1')
    })

    test('filters by channel', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values([
          {
            id: 'event-1',
            sourceChannel: 'whatsapp',
            sourceId: 'msg-1',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'event-2',
            sourceChannel: 'email',
            sourceId: 'msg-2',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/events?channel=email')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.events.length).toBe(1)
      expect(body.events[0].id).toBe('event-2')
    })
  })

  describe('GET /api/assistant/events/:id', () => {
    test('returns event by id', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          summary: 'Test event',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/events/event-1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('event-1')
      expect(body.sourceChannel).toBe('whatsapp')
      expect(body.summary).toBe('Test event')
    })

    test('returns 404 for non-existent event', async () => {
      const { get } = createTestApp()
      const res = await get('/api/assistant/events/non-existent')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Event not found')
    })
  })

  describe('POST /api/assistant/events', () => {
    test('creates a new event', async () => {
      const { post } = createTestApp()

      const res = await post('/api/assistant/events', {
        sourceChannel: 'whatsapp',
        sourceId: 'msg-123',
        summary: 'New actionable event',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.id).toBeDefined()
      expect(body.sourceChannel).toBe('whatsapp')
      expect(body.sourceId).toBe('msg-123')
      expect(body.summary).toBe('New actionable event')
      expect(body.status).toBe('pending')
      expect(body.actionLog).toEqual([])
    })

    test('creates event with custom status', async () => {
      const { post } = createTestApp()

      const res = await post('/api/assistant/events', {
        sourceChannel: 'email',
        sourceId: 'email-456',
        status: 'monitoring',
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.status).toBe('monitoring')
    })

    test('creates event with metadata', async () => {
      const { post } = createTestApp()

      const res = await post('/api/assistant/events', {
        sourceChannel: 'slack',
        sourceId: 'slack-789',
        sourceMetadata: { sender: 'user@example.com', subject: 'Test' },
      })
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body.sourceMetadata).toEqual({ sender: 'user@example.com', subject: 'Test' })
    })

    test('returns 400 when sourceChannel missing', async () => {
      const { post } = createTestApp()

      const res = await post('/api/assistant/events', {
        sourceId: 'msg-123',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('sourceChannel')
    })

    test('returns 400 when sourceId missing', async () => {
      const { post } = createTestApp()

      const res = await post('/api/assistant/events', {
        sourceChannel: 'whatsapp',
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('sourceId')
    })
  })

  describe('PATCH /api/assistant/events/:id', () => {
    test('updates event status', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/assistant/events/event-1', {
        status: 'acted_upon',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.status).toBe('acted_upon')
    })

    test('adds to action log', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          status: 'pending',
          actionLog: [],
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/assistant/events/event-1', {
        actionLogEntry: 'Sent a reply',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.actionLog.length).toBe(1)
      expect(body.actionLog[0].action).toBe('Sent a reply')
      expect(body.actionLog[0].timestamp).toBeDefined()
    })

    test('appends to existing action log', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          status: 'pending',
          actionLog: [{ timestamp: now, action: 'First action' }],
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/assistant/events/event-1', {
        actionLogEntry: 'Second action',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.actionLog.length).toBe(2)
      expect(body.actionLog[0].action).toBe('First action')
      expect(body.actionLog[1].action).toBe('Second action')
    })

    test('links to a task', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/assistant/events/event-1', {
        linkedTaskId: 'task-123',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.linkedTaskId).toBe('task-123')
    })

    test('returns 404 for non-existent event', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/assistant/events/non-existent', {
        status: 'acted_upon',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Event not found')
    })
  })

  describe('DELETE /api/assistant/events/:id', () => {
    test('deletes an event', async () => {
      const now = new Date().toISOString()

      db.insert(actionableEvents)
        .values({
          id: 'event-1',
          sourceChannel: 'whatsapp',
          sourceId: 'msg-1',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const app = createTestApp()
      const res = await app.delete('/api/assistant/events/event-1')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.success).toBe(true)

      // Verify deleted
      const event = db.select().from(actionableEvents).where(eq(actionableEvents.id, 'event-1')).get()
      expect(event).toBeUndefined()
    })

    test('returns 404 for non-existent event', async () => {
      const app = createTestApp()
      const res = await app.delete('/api/assistant/events/non-existent')
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toBe('Event not found')
    })
  })

  describe('GET /api/assistant/sweeps/last/:type', () => {
    test('returns most recent sweep of type', async () => {
      const now = new Date().toISOString()
      const earlier = new Date(Date.now() - 10000).toISOString()

      db.insert(sweepRuns)
        .values([
          {
            id: 'sweep-1',
            type: 'hourly',
            startedAt: earlier,
            completedAt: earlier,
            status: 'completed',
          },
          {
            id: 'sweep-2',
            type: 'hourly',
            startedAt: now,
            completedAt: now,
            status: 'completed',
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/sweeps/last/hourly')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('sweep-2') // Most recent
    })

    test('returns null when no sweeps exist', async () => {
      const { get } = createTestApp()
      const res = await get('/api/assistant/sweeps/last/hourly')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toBeNull()
    })

    test('returns only sweeps of specified type', async () => {
      const now = new Date().toISOString()

      db.insert(sweepRuns)
        .values([
          {
            id: 'sweep-1',
            type: 'hourly',
            startedAt: now,
            completedAt: now,
            status: 'completed',
          },
          {
            id: 'sweep-2',
            type: 'morning_ritual',
            startedAt: now,
            completedAt: now,
            status: 'completed',
          },
        ])
        .run()

      const { get } = createTestApp()
      const res = await get('/api/assistant/sweeps/last/morning_ritual')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.id).toBe('sweep-2')
      expect(body.type).toBe('morning_ritual')
    })
  })
})
