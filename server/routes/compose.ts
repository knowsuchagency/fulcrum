import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { repositories } from '../db/schema'
import { findComposeFile, parseComposeFile } from '../services/compose-parser'

const app = new Hono()

// GET /api/compose/parse - Parse compose file from repository
app.get('/parse', async (c) => {
  const repoPath = c.req.query('repoPath')
  const repoId = c.req.query('repoId')

  let path: string | undefined

  if (repoId) {
    // Look up repository by ID
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, repoId),
    })
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }
    path = repo.path
  } else if (repoPath) {
    path = repoPath
  }

  if (!path) {
    return c.json({ error: 'repoPath or repoId is required' }, 400)
  }

  try {
    const result = await parseComposeFile(path)
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to parse compose file' }, 400)
  }
})

// GET /api/compose/find - Check if compose file exists in repository
app.get('/find', async (c) => {
  const repoPath = c.req.query('repoPath')
  const repoId = c.req.query('repoId')

  let path: string | undefined

  if (repoId) {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, repoId),
    })
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }
    path = repo.path
  } else if (repoPath) {
    path = repoPath
  }

  if (!path) {
    return c.json({ error: 'repoPath or repoId is required' }, 400)
  }

  try {
    const composeFile = await findComposeFile(path)
    return c.json({ found: !!composeFile, file: composeFile })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to find compose file' }, 400)
  }
})

export default app
