import { Hono } from 'hono'
import {
  isJobsAvailable,
  canCreateJobs,
  getPlatform,
  listJobs,
  getJob,
  getJobLogs,
  enableJob,
  startJob,
  stopJob,
  runJobNow,
  createJob,
  updateJob,
  deleteJob,
} from '../services/job-service'
import { log } from '../lib/logger'
import type { JobScope, CreateTimerRequest, UpdateTimerRequest } from '../../shared/types'

const app = new Hono()

// GET /api/jobs/available - Check if jobs feature is available on this platform
app.get('/available', (c) => {
  return c.json({
    available: isJobsAvailable(),
    canCreate: canCreateJobs(),
    platform: getPlatform(),
  })
})

// GET /api/jobs - List all timers
app.get('/', (c) => {
  const scope = (c.req.query('scope') as 'all' | 'user' | 'system') || 'all'

  try {
    const jobs = listJobs(scope)
    return c.json(jobs)
  } catch (err) {
    log.jobs.error('Failed to list jobs', { error: String(err) })
    return c.json({ error: 'Failed to list jobs' }, 500)
  }
})

// GET /api/jobs/:name - Get timer details
app.get('/:name', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    const job = getJob(name, scope)
    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }
    return c.json(job)
  } catch (err) {
    log.jobs.error('Failed to get job', { name, error: String(err) })
    return c.json({ error: 'Failed to get job' }, 500)
  }
})

// GET /api/jobs/:name/logs - Get timer logs
app.get('/:name/logs', (c) => {
  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'
  const lines = parseInt(c.req.query('lines') || '100', 10)

  try {
    const entries = getJobLogs(name, scope, lines)
    return c.json({ entries })
  } catch (err) {
    log.jobs.error('Failed to get job logs', { name, error: String(err) })
    return c.json({ error: 'Failed to get job logs' }, 500)
  }
})

// POST /api/jobs - Create new user timer
app.post('/', async (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job creation not supported on this platform' }, 400)
  }

  try {
    const body = await c.req.json<CreateTimerRequest>()

    if (!body.name || !body.description || !body.schedule || !body.command) {
      return c.json({ error: 'name, description, schedule, and command are required' }, 400)
    }

    // Validate name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
      return c.json({ error: 'Job name must contain only alphanumeric characters, hyphens, and underscores' }, 400)
    }

    createJob(body)
    return c.json({ success: true }, 201)
  } catch (err) {
    log.jobs.error('Failed to create job', { error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create job' }, 400)
  }
})

// PATCH /api/jobs/:name - Update user timer
app.patch('/:name', async (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')

  try {
    const body = await c.req.json<UpdateTimerRequest>()
    updateJob(name, body)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to update job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update job' }, 400)
  }
})

// DELETE /api/jobs/:name - Delete user timer
app.delete('/:name', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job deletion not supported on this platform' }, 400)
  }

  const name = c.req.param('name')

  try {
    deleteJob(name)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to delete job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete job' }, 400)
  }
})

// POST /api/jobs/:name/enable - Enable timer
app.post('/:name/enable', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    enableJob(name, scope, true)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to enable job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to enable job' }, 400)
  }
})

// POST /api/jobs/:name/disable - Disable timer
app.post('/:name/disable', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    enableJob(name, scope, false)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to disable job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to disable job' }, 400)
  }
})

// POST /api/jobs/:name/start - Start timer
app.post('/:name/start', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    startJob(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to start job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to start job' }, 400)
  }
})

// POST /api/jobs/:name/stop - Stop timer
app.post('/:name/stop', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    stopJob(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to stop job', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to stop job' }, 400)
  }
})

// POST /api/jobs/:name/run - Run associated service immediately
app.post('/:name/run', (c) => {
  if (!canCreateJobs()) {
    return c.json({ error: 'Job modification not supported on this platform' }, 400)
  }

  const name = c.req.param('name')
  const scope = (c.req.query('scope') as JobScope) || 'user'

  try {
    runJobNow(name, scope)
    return c.json({ success: true })
  } catch (err) {
    log.jobs.error('Failed to run job service', { name, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to run job service' }, 400)
  }
})

export default app
