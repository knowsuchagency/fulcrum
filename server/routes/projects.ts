import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { db, projects, repositories, apps, appServices, terminalTabs } from '../db'
import { eq, desc, sql } from 'drizzle-orm'
import type { ProjectWithDetails } from '../../shared/types'

const app = new Hono()

// Helper to build project with nested entities
function buildProjectWithDetails(
  project: typeof projects.$inferSelect,
  repo: typeof repositories.$inferSelect | null,
  appRow: typeof apps.$inferSelect | null,
  services: (typeof appServices.$inferSelect)[],
  tab: typeof terminalTabs.$inferSelect | null
): ProjectWithDetails {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repositoryId: project.repositoryId,
    appId: project.appId,
    terminalTabId: project.terminalTabId,
    status: project.status as 'active' | 'archived',
    lastAccessedAt: project.lastAccessedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    repository: repo
      ? {
          id: repo.id,
          path: repo.path,
          displayName: repo.displayName,
          startupScript: repo.startupScript,
          copyFiles: repo.copyFiles,
          defaultAgent: repo.defaultAgent as 'claude' | 'opencode' | null,
          claudeOptions: repo.claudeOptions ? JSON.parse(repo.claudeOptions) : null,
          opencodeOptions: repo.opencodeOptions ? JSON.parse(repo.opencodeOptions) : null,
          opencodeModel: repo.opencodeModel,
          remoteUrl: repo.remoteUrl,
          isCopierTemplate: repo.isCopierTemplate ?? false,
        }
      : null,
    app: appRow
      ? {
          id: appRow.id,
          name: appRow.name,
          branch: appRow.branch,
          composeFile: appRow.composeFile,
          status: appRow.status as 'stopped' | 'building' | 'running' | 'failed',
          autoDeployEnabled: appRow.autoDeployEnabled ?? false,
          noCacheBuild: appRow.noCacheBuild ?? false,
          notificationsEnabled: appRow.notificationsEnabled ?? true,
          environmentVariables: appRow.environmentVariables
            ? JSON.parse(appRow.environmentVariables)
            : null,
          lastDeployedAt: appRow.lastDeployedAt,
          lastDeployCommit: appRow.lastDeployCommit,
          services: services.map((s) => ({
            id: s.id,
            appId: s.appId,
            serviceName: s.serviceName,
            containerPort: s.containerPort,
            exposed: s.exposed ?? false,
            domain: s.domain,
            exposureMethod: (s.exposureMethod ?? 'dns') as 'dns' | 'tunnel',
            status: s.status,
            containerId: s.containerId,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        }
      : null,
    terminalTab: tab
      ? {
          id: tab.id,
          name: tab.name,
          directory: tab.directory,
        }
      : null,
  }
}

// GET /api/projects - List all projects with nested entities
app.get('/', (c) => {
  const allProjects = db
    .select()
    .from(projects)
    .orderBy(
      desc(sql`COALESCE(${projects.lastAccessedAt}, '1970-01-01')`),
      desc(projects.createdAt)
    )
    .all()

  const result: ProjectWithDetails[] = allProjects.map((project) => {
    // Get repository if linked
    const repo = project.repositoryId
      ? db.select().from(repositories).where(eq(repositories.id, project.repositoryId)).get()
      : null

    // Get app if linked
    const appRow = project.appId
      ? db.select().from(apps).where(eq(apps.id, project.appId)).get()
      : null

    // Get services if app exists
    const services = appRow
      ? db.select().from(appServices).where(eq(appServices.appId, appRow.id)).all()
      : []

    // Get terminal tab if linked
    const tab = project.terminalTabId
      ? db.select().from(terminalTabs).where(eq(terminalTabs.id, project.terminalTabId)).get()
      : null

    return buildProjectWithDetails(project, repo ?? null, appRow ?? null, services, tab ?? null)
  })

  return c.json(result)
})

// GET /api/projects/:id - Get single project with full details
app.get('/:id', (c) => {
  const id = c.req.param('id')

  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const repo = project.repositoryId
    ? db.select().from(repositories).where(eq(repositories.id, project.repositoryId)).get()
    : null

  const appRow = project.appId
    ? db.select().from(apps).where(eq(apps.id, project.appId)).get()
    : null

  const services = appRow
    ? db.select().from(appServices).where(eq(appServices.appId, appRow.id)).all()
    : []

  const tab = project.terminalTabId
    ? db.select().from(terminalTabs).where(eq(terminalTabs.id, project.terminalTabId)).get()
    : null

  return c.json(buildProjectWithDetails(project, repo ?? null, appRow ?? null, services, tab ?? null))
})

// POST /api/projects - Create project from repository
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      description?: string
      repositoryId: string
    }>()

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400)
    }

    if (!body.repositoryId) {
      return c.json({ error: 'repositoryId is required' }, 400)
    }

    // Verify repository exists
    const repo = db.select().from(repositories).where(eq(repositories.id, body.repositoryId)).get()
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    // Check if project already exists for this repository
    const existing = db
      .select()
      .from(projects)
      .where(eq(projects.repositoryId, body.repositoryId))
      .get()
    if (existing) {
      return c.json({ error: 'Project already exists for this repository' }, 400)
    }

    // Check if there's an app linked to this repository
    const linkedApp = db.select().from(apps).where(eq(apps.repositoryId, body.repositoryId)).get()

    const now = new Date().toISOString()

    // Create terminal tab for this project
    const tabId = nanoid()
    db.insert(terminalTabs)
      .values({
        id: tabId,
        name: body.name,
        position: 0,
        directory: repo.path,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Create project
    const projectId = nanoid()
    db.insert(projects)
      .values({
        id: projectId,
        name: body.name,
        description: body.description ?? null,
        repositoryId: body.repositoryId,
        appId: linkedApp?.id ?? null,
        terminalTabId: tabId,
        status: 'active',
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Fetch and return the created project
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Failed to create project' }, 500)
    }

    const services = linkedApp
      ? db.select().from(appServices).where(eq(appServices.appId, linkedApp.id)).all()
      : []

    const tab = db.select().from(terminalTabs).where(eq(terminalTabs.id, tabId)).get()

    return c.json(
      buildProjectWithDetails(project, repo, linkedApp ?? null, services, tab ?? null),
      201
    )
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create project' }, 400)
  }
})

// PATCH /api/projects/:id - Update project metadata
app.patch('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const existing = db.select().from(projects).where(eq(projects.id, id)).get()
    if (!existing) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const body = await c.req.json<{
      name?: string
      description?: string | null
      status?: 'active' | 'archived'
    }>()

    const now = new Date().toISOString()

    const updateData: Record<string, unknown> = { updatedAt: now }
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.status !== undefined) updateData.status = body.status

    db.update(projects).set(updateData).where(eq(projects.id, id)).run()

    // Also update terminal tab name if project name changed
    if (body.name && existing.terminalTabId) {
      db.update(terminalTabs)
        .set({ name: body.name, updatedAt: now })
        .where(eq(terminalTabs.id, existing.terminalTabId))
        .run()
    }

    // Fetch and return updated project
    const project = db.select().from(projects).where(eq(projects.id, id)).get()!

    const repo = project.repositoryId
      ? db.select().from(repositories).where(eq(repositories.id, project.repositoryId)).get()
      : null

    const appRow = project.appId
      ? db.select().from(apps).where(eq(apps.id, project.appId)).get()
      : null

    const services = appRow
      ? db.select().from(appServices).where(eq(appServices.appId, appRow.id)).all()
      : []

    const tab = project.terminalTabId
      ? db.select().from(terminalTabs).where(eq(terminalTabs.id, project.terminalTabId)).get()
      : null

    return c.json(buildProjectWithDetails(project, repo ?? null, appRow ?? null, services, tab ?? null))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update project' }, 400)
  }
})

// DELETE /api/projects/:id - Delete project
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  // Query params for cascade options
  const deleteRepository = c.req.query('deleteRepository') === 'true'
  const deleteApp = c.req.query('deleteApp') === 'true'

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Delete terminal tab (always)
  if (existing.terminalTabId) {
    db.delete(terminalTabs).where(eq(terminalTabs.id, existing.terminalTabId)).run()
  }

  // Optionally delete app (this will cascade to services/deployments via the apps route logic)
  if (deleteApp && existing.appId) {
    // Delete app services first
    db.delete(appServices).where(eq(appServices.appId, existing.appId)).run()
    // Delete app
    db.delete(apps).where(eq(apps.id, existing.appId)).run()
  }

  // Optionally delete repository
  if (deleteRepository && existing.repositoryId) {
    db.delete(repositories).where(eq(repositories.id, existing.repositoryId)).run()
  }

  // Delete project
  db.delete(projects).where(eq(projects.id, id)).run()

  return c.json({
    success: true,
    deletedRepository: deleteRepository && !!existing.repositoryId,
    deletedApp: deleteApp && !!existing.appId,
  })
})

// POST /api/projects/:id/add-app - Add app to existing project
app.post('/:id/add-app', async (c) => {
  const projectId = c.req.param('id')

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    if (project.appId) {
      return c.json({ error: 'Project already has an app' }, 400)
    }

    if (!project.repositoryId) {
      return c.json({ error: 'Project must have a repository to add an app' }, 400)
    }

    const body = await c.req.json<{
      appId: string
    }>()

    if (!body.appId) {
      return c.json({ error: 'appId is required' }, 400)
    }

    // Verify app exists and belongs to the project's repository
    const appRow = db.select().from(apps).where(eq(apps.id, body.appId)).get()
    if (!appRow) {
      return c.json({ error: 'App not found' }, 404)
    }

    if (appRow.repositoryId !== project.repositoryId) {
      return c.json({ error: 'App must belong to the project repository' }, 400)
    }

    const now = new Date().toISOString()

    db.update(projects)
      .set({ appId: body.appId, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    // Return updated project
    const updated = db.select().from(projects).where(eq(projects.id, projectId)).get()!

    const repo = db
      .select()
      .from(repositories)
      .where(eq(repositories.id, project.repositoryId))
      .get()

    const services = db.select().from(appServices).where(eq(appServices.appId, body.appId)).all()

    const tab = project.terminalTabId
      ? db.select().from(terminalTabs).where(eq(terminalTabs.id, project.terminalTabId)).get()
      : null

    return c.json(buildProjectWithDetails(updated, repo ?? null, appRow, services, tab ?? null))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to add app' }, 400)
  }
})

// DELETE /api/projects/:id/app - Remove app from project
app.delete('/:id/app', async (c) => {
  const projectId = c.req.param('id')
  const deleteApp = c.req.query('delete') === 'true'

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    if (!project.appId) {
      return c.json({ error: 'Project does not have an app' }, 400)
    }

    const appId = project.appId
    const now = new Date().toISOString()

    // Remove app from project
    db.update(projects)
      .set({ appId: null, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    // Optionally delete the app
    if (deleteApp) {
      db.delete(appServices).where(eq(appServices.appId, appId)).run()
      db.delete(apps).where(eq(apps.id, appId)).run()
    }

    return c.json({ success: true, appDeleted: deleteApp })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to remove app' }, 400)
  }
})

// POST /api/projects/:id/access - Update lastAccessedAt timestamp
app.post('/:id/access', (c) => {
  const id = c.req.param('id')

  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const now = new Date().toISOString()
  db.update(projects)
    .set({ lastAccessedAt: now, updatedAt: now })
    .where(eq(projects.id, id))
    .run()

  return c.json({ success: true })
})

export default app
