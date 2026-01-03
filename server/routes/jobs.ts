import { Hono } from 'hono'
import {
  listTimers,
  getTimer,
  getTimerLogs,
  enableTimer,
  startTimer,
  stopTimer,
  runNow,
  createTimer,
  updateTimer,
  deleteTimer,
  isSystemdAvailable,
} from '../services/systemd-timer'
import { log } from '../lib/logger'
import type { JobScope, CreateTimerRequest, UpdateTimerRequest } from '../../shared/types'

const app = new Hono()

// GET /api/jobs/available - Check if jobs feature is available on this platform
app.get('/available', (c) => {
  const available = isSystemdAvailable()
  return c.json({ available })
})

// GET /api/jobs - List all timers
app.get('/', (c) => {
  const scope = (c.req.query('scope') as 'all' | 'user' | 'system') || 'all'

  try {
    const timers = listTimers(scope)
    return c.json(timers)
  } catch (err) {
    log.jobs.error('Failed to list timers', { error: String(err) })
    return c.json({ error: 'Failed to list timers' }, 500)
  }
})

// GET /api/jobs/:name - Get timer details
app.get('/:name', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    const timer = getTimer(name, scope)
    if (!timer) {
      return c.json({ error: 'Timer not found' }, 404)
    }
    return c.json(timer)
  } catch (err) {
    log.jobs.error('Failed to get timer', { name, error: String(err) })
    return c.json({ error: 'Failed to get timer' }, 500)
  }
})

// GET /api/jobs/:name/logs - Get timer logs
app.get('/:name/logs', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'
  const lines = parseInt(c.req.query('lines') || '100', 10)

  try {
    const entries = getTimerLogs(name, scope, lines)
    return c.json({ entries })
  } catch (err) {
    log.jobs.error('Failed to get timer logs', { name, error: String(err) })
    return c.json({ error: 'Failed to get timer logs' }, 500)
  }
})

// POST /api/jobs - Create new user timer
app.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateTimerRequest>()

    if (!body.name || !body.description || !body.schedule || !body.command) {
      return c.json({ error: 'name, description, schedule, and command are required' }, 400)
    }

    // Validate name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
      return c.json({ error: 'Timer name must contain only alphanumeric characters, hyphens, and underscores' }, 400)
    }

    createTimer(body)
    return c.json({ success: true }, 201)
  } catch (err) {
    log.jobs.error('Failed to create timer', { error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create timer' }, 400)
  }
})

// PATCH /api/jobs/:name - Update user timer
app.patch('/:name', async (c) => {
  const name = c.req.param('name')

  try {
    const body = await c.req.json<UpdateTimerRequest>()
    updateTimer(name, body)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to update timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update timer' }, 400)
  }
})

// DELETE /api/jobs/:name - Delete user timer
app.delete('/:name', (c) => {
  const name = c.req.param('name')

  try {
    deleteTimer(name)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to delete timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete timer' }, 400)
  }
})

// POST /api/jobs/:name/enable - Enable timer
app.post('/:name/enable', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    enableTimer(name, scope, true)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to enable timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to enable timer' }, 400)
  }
})

// POST /api/jobs/:name/disable - Disable timer
app.post('/:name/disable', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    enableTimer(name, scope, false)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to disable timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to disable timer' }, 400)
  }
})

// POST /api/jobs/:name/start - Start timer
app.post('/:name/start', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    startTimer(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to start timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to start timer' }, 400)
  }
})

// POST /api/jobs/:name/stop - Stop timer
app.post('/:name/stop', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    stopTimer(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to stop timer', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to stop timer' }, 400)
  }
})

// POST /api/jobs/:name/run - Run associated service immediately
app.post('/:name/run', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    runNow(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to run timer service', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to run timer service' }, 400)
  }
})

export default app
