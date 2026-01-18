import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { db, projects, repositories, apps, appServices, terminalTabs, projectRepositories, tasks, tags, projectTags } from '../db'
import { eq, desc, sql, and, or, inArray } from 'drizzle-orm'
import type { ProjectWithDetails, ProjectRepositoryDetails, Tag } from '../../shared/types'
import { broadcast } from '../websocket/terminal-ws'

const app = new Hono()

// Helper to get repositories for a project (from join table and legacy repositoryId)
function getProjectRepositories(projectId: string, legacyRepoId: string | null): ProjectRepositoryDetails[] {
  // Get repositories from the join table
  const joinedRepos = db
    .select()
    .from(projectRepositories)
    .where(eq(projectRepositories.projectId, projectId))
    .all()

  const result: ProjectRepositoryDetails[] = []

  for (const jr of joinedRepos) {
    const repo = db.select().from(repositories).where(eq(repositories.id, jr.repositoryId)).get()
    if (repo) {
      result.push({
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
        isPrimary: jr.isPrimary ?? false,
      })
    }
  }

  // If no repos in join table but legacy repositoryId exists, include it
  if (result.length === 0 && legacyRepoId) {
    const repo = db.select().from(repositories).where(eq(repositories.id, legacyRepoId)).get()
    if (repo) {
      result.push({
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
        isPrimary: true, // Legacy single repo is primary by default
      })
    }
  }

  return result
}

// Helper to get task count for a project
// Counts tasks that are either:
// 1. Directly associated with the project via projectId
// 2. Associated with a repository that belongs to this project (via repositoryId or repoPath)
function getProjectTaskCount(projectId: string, legacyRepoId: string | null): number {
  // Get repository info associated with this project
  const repoIds: string[] = []
  const repoPaths: string[] = []

  // From join table
  const joinedRepos = db
    .select({ repositoryId: projectRepositories.repositoryId })
    .from(projectRepositories)
    .where(eq(projectRepositories.projectId, projectId))
    .all()

  for (const jr of joinedRepos) {
    repoIds.push(jr.repositoryId)
    // Get the repo path too
    const repo = db.select({ path: repositories.path }).from(repositories).where(eq(repositories.id, jr.repositoryId)).get()
    if (repo?.path) {
      repoPaths.push(repo.path)
    }
  }

  // Legacy repositoryId
  if (legacyRepoId) {
    if (!repoIds.includes(legacyRepoId)) {
      repoIds.push(legacyRepoId)
    }
    const repo = db.select({ path: repositories.path }).from(repositories).where(eq(repositories.id, legacyRepoId)).get()
    if (repo?.path && !repoPaths.includes(repo.path)) {
      repoPaths.push(repo.path)
    }
  }

  // Build conditions for project/repo association
  const associationConditions = [eq(tasks.projectId, projectId)]
  if (repoIds.length > 0) {
    associationConditions.push(inArray(tasks.repositoryId, repoIds))
  }
  if (repoPaths.length > 0) {
    associationConditions.push(inArray(tasks.repoPath, repoPaths))
  }

  // Only count active tasks (not DONE or CANCELED)
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(
      or(...associationConditions),
      sql`${tasks.status} NOT IN ('DONE', 'CANCELED')`
    ))
    .get()
  return result?.count ?? 0
}

// Helper to get tags for a project
function getProjectTags(projectId: string): Tag[] {
  const joins = db
    .select()
    .from(projectTags)
    .where(eq(projectTags.projectId, projectId))
    .all()

  const result: Tag[] = []
  for (const join of joins) {
    const tag = db.select().from(tags).where(eq(tags.id, join.tagId)).get()
    if (tag) {
      result.push({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt,
      })
    }
  }
  return result
}

// Helper to build project with nested entities
function buildProjectWithDetails(
  project: typeof projects.$inferSelect,
  repo: typeof repositories.$inferSelect | null,
  appRow: typeof apps.$inferSelect | null,
  services: (typeof appServices.$inferSelect)[],
  tab: typeof terminalTabs.$inferSelect | null
): ProjectWithDetails {
  const projectRepos = getProjectRepositories(project.id, project.repositoryId)
  const taskCount = getProjectTaskCount(project.id, project.repositoryId)
  const projectTagsList = getProjectTags(project.id)

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
    // DEPRECATED: Use repositories array instead
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
    // New: Multiple repositories per project
    repositories: projectRepos,
    app: appRow
      ? {
          id: appRow.id,
          name: appRow.name,
          branch: appRow.branch,
          composeFile: appRow.composeFile,
          status: appRow.status as 'stopped' | 'building' | 'running' | 'failed',
          autoDeployEnabled: appRow.autoDeployEnabled ?? false,
          autoPortAllocation: appRow.autoPortAllocation ?? true,
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
    tags: projectTagsList,
    taskCount,
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

// POST /api/projects - Create project with repository
// Accepts either:
// - repositoryId: Link to existing repository
// - path: Create repository from local path
// - url: Clone repository from URL
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      description?: string
      // Option 1: Link to existing repository
      repositoryId?: string
      // Option 2: Create from local path
      path?: string
      // Option 3: Clone from URL
      url?: string
      targetDir?: string // For cloning
      folderName?: string // For cloning
    }>()

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400)
    }

    // Must provide exactly one of: repositoryId, path, or url
    const options = [body.repositoryId, body.path, body.url].filter(Boolean)
    if (options.length === 0) {
      return c.json({ error: 'Must provide repositoryId, path, or url' }, 400)
    }
    if (options.length > 1) {
      return c.json({ error: 'Provide only one of: repositoryId, path, or url' }, 400)
    }

    const { expandPath } = await import('../lib/settings')
    const now = new Date().toISOString()
    let repo: typeof repositories.$inferSelect | undefined

    if (body.repositoryId) {
      // Option 1: Link to existing repository
      repo = db.select().from(repositories).where(eq(repositories.id, body.repositoryId)).get()
      if (!repo) {
        return c.json({ error: 'Repository not found' }, 404)
      }
    } else if (body.path) {
      // Option 2: Create from local path
      const repoPath = expandPath(body.path)

      if (!existsSync(repoPath)) {
        return c.json({ error: `Directory does not exist: ${repoPath}` }, 400)
      }

      // Check for duplicate path
      const existing = db.select().from(repositories).where(eq(repositories.path, repoPath)).get()
      if (existing) {
        return c.json({ error: 'Repository with this path already exists' }, 400)
      }

      const displayName = repoPath.split('/').pop() || 'repo'
      const repoId = nanoid()

      db.insert(repositories)
        .values({
          id: repoId,
          path: repoPath,
          displayName,
          startupScript: null,
          copyFiles: null,
          isCopierTemplate: false,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      repo = db.select().from(repositories).where(eq(repositories.id, repoId)).get()
    } else if (body.url) {
      // Option 3: Clone from URL
      const { isGitUrl, extractRepoNameFromUrl } = await import('../lib/git-utils')
      const { getSettings } = await import('../lib/settings')
      const { execSync } = await import('node:child_process')
      const { mkdirSync, rmSync } = await import('node:fs')
      const { homedir } = await import('node:os')

      if (!isGitUrl(body.url)) {
        return c.json({ error: 'Invalid git URL format' }, 400)
      }

      const settings = getSettings()
      let parentDir = body.targetDir?.trim() || settings.paths.defaultGitReposDir
      parentDir = expandPath(parentDir)

      const home = homedir()
      if (resolve(parentDir) === home) {
        return c.json({ error: 'Cannot clone directly into home directory. Please specify a subdirectory.' }, 400)
      }

      const repoName = body.folderName?.trim() || extractRepoNameFromUrl(body.url)
      if (!repoName || repoName === '.' || repoName === '..') {
        return c.json({ error: 'Invalid folder name' }, 400)
      }
      if (repoName.includes('/') || repoName.includes('\\')) {
        return c.json({ error: 'Folder name cannot contain path separators' }, 400)
      }

      const targetPath = join(parentDir, repoName)
      const resolvedParent = resolve(parentDir)
      const resolvedTarget = resolve(targetPath)

      if (!resolvedTarget.startsWith(resolvedParent + '/') && resolvedTarget !== resolvedParent) {
        return c.json({ error: 'Invalid target path' }, 400)
      }

      if (existsSync(targetPath)) {
        return c.json({ error: `Directory already exists: ${targetPath}` }, 400)
      }

      // Check for duplicate path in database
      const existingRepo = db.select().from(repositories).where(eq(repositories.path, targetPath)).get()
      if (existingRepo) {
        return c.json({ error: 'Repository with this path already exists in database' }, 400)
      }

      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      // Clone the repository
      try {
        execSync(`git clone "${body.url}" "${targetPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120000,
        })
      } catch (cloneErr) {
        if (existsSync(targetPath) && resolvedTarget.startsWith(resolvedParent + '/')) {
          rmSync(targetPath, { recursive: true, force: true })
        }
        const errorMessage = cloneErr instanceof Error ? cloneErr.message : 'Clone failed'
        if (errorMessage.includes('Permission denied') || errorMessage.includes('publickey')) {
          return c.json({ error: 'Authentication failed. Check your SSH keys or use HTTPS with credentials.' }, 500)
        }
        if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
          return c.json({ error: 'Repository not found or access denied' }, 500)
        }
        return c.json({ error: `Failed to clone repository: ${errorMessage}` }, 500)
      }

      const displayName = repoName
      const repoId = nanoid()

      db.insert(repositories)
        .values({
          id: repoId,
          path: targetPath,
          displayName,
          remoteUrl: body.url,
          startupScript: null,
          copyFiles: null,
          isCopierTemplate: false,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      repo = db.select().from(repositories).where(eq(repositories.id, repoId)).get()
    }

    if (!repo) {
      return c.json({ error: 'Failed to create or find repository' }, 500)
    }

    // Check if project already exists for this repository
    const existingProject = db.select().from(projects).where(eq(projects.repositoryId, repo.id)).get()
    if (existingProject) {
      return c.json({ error: 'Project already exists for this repository' }, 400)
    }

    // Check if there's an app linked to this repository
    const linkedApp = db.select().from(apps).where(eq(apps.repositoryId, repo.id)).get()

    // Create project
    const projectId = nanoid()
    db.insert(projects)
      .values({
        id: projectId,
        name: body.name,
        description: body.description ?? null,
        repositoryId: repo.id,
        appId: linkedApp?.id ?? null,
        terminalTabId: null,
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

    return c.json(
      buildProjectWithDetails(project, repo, linkedApp ?? null, services, null),
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
  const deleteDirectory = c.req.query('deleteDirectory') === 'true'
  const deleteApp = c.req.query('deleteApp') === 'true'

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Optionally delete app (this will cascade to services/deployments via the apps route logic)
  if (deleteApp && existing.appId) {
    // Delete app services first
    db.delete(appServices).where(eq(appServices.appId, existing.appId)).run()
    // Delete app
    db.delete(apps).where(eq(apps.id, existing.appId)).run()
  }

  // Get repository path before deleting
  let repoPath: string | null = null
  if (existing.repositoryId) {
    const repo = db.select().from(repositories).where(eq(repositories.id, existing.repositoryId)).get()
    repoPath = repo?.path ?? null
  }

  // Always delete the repository record (projects and repos are synonymous)
  if (existing.repositoryId) {
    db.delete(repositories).where(eq(repositories.id, existing.repositoryId)).run()
  }

  // Optionally delete the directory from disk
  let directoryDeleted = false
  if (deleteDirectory && repoPath) {
    // SAFETY: Reject if path is home directory
    const home = homedir()
    if (resolve(repoPath) === home) {
      return c.json({ error: 'Cannot delete home directory' }, 400)
    }

    // SAFETY: Reject common dangerous paths
    const dangerousPaths = ['/', '/home', '/usr', '/etc', '/var', '/tmp', '/root']
    if (dangerousPaths.includes(resolve(repoPath))) {
      return c.json({ error: 'Cannot delete system directory' }, 400)
    }

    // SAFETY: Only delete if directory exists and contains .git
    if (existsSync(repoPath)) {
      const gitPath = join(repoPath, '.git')
      if (!existsSync(gitPath)) {
        return c.json({ error: 'Directory does not appear to be a git repository' }, 400)
      }

      try {
        rmSync(repoPath, { recursive: true, force: true })
        directoryDeleted = true
      } catch (err) {
        return c.json({
          error: `Failed to delete directory: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }, 500)
      }
    }
  }

  // Delete project
  db.delete(projects).where(eq(projects.id, id)).run()

  return c.json({
    success: true,
    deletedDirectory: directoryDeleted,
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

// POST /api/projects/:id/create-app - Create and link app to project
app.post('/:id/create-app', async (c) => {
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
      return c.json({ error: 'Project must have a repository to create an app' }, 400)
    }

    const repo = db.select().from(repositories).where(eq(repositories.id, project.repositoryId)).get()
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    const body = await c.req.json<{
      name?: string
      branch?: string
      composeFile?: string
      autoDeployEnabled?: boolean
      services?: Array<{
        serviceName: string
        containerPort?: number
        exposed: boolean
        domain?: string
        exposureMethod?: 'dns' | 'tunnel'
      }>
    }>()

    // Parse compose file to detect services if not provided
    const { findComposeFile, parseComposeFile } = await import('../services/compose-parser')
    const composeFile = body.composeFile ?? (await findComposeFile(repo.path))
    if (!composeFile) {
      return c.json({ error: 'No compose file found in repository' }, 400)
    }

    const now = new Date().toISOString()
    const appId = nanoid()
    const appName = body.name || repo.displayName || 'app'

    // Create the app
    db.insert(apps)
      .values({
        id: appId,
        name: appName,
        repositoryId: project.repositoryId,
        branch: body.branch || 'main',
        composeFile,
        autoDeployEnabled: body.autoDeployEnabled ?? false,
        status: 'stopped',
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Create services - use provided services or parse from compose file
    let servicesToCreate = body.services
    if (!servicesToCreate || servicesToCreate.length === 0) {
      // Parse compose file to detect services
      const parsed = await parseComposeFile(repo.path, composeFile)
      servicesToCreate = parsed.services.map((svc) => ({
        serviceName: svc.name,
        containerPort: svc.ports?.[0]?.container ?? null,
        exposed: false,
      }))
    }

    for (const svc of servicesToCreate) {
      db.insert(appServices)
        .values({
          id: nanoid(),
          appId,
          serviceName: svc.serviceName,
          containerPort: svc.containerPort ?? null,
          exposed: svc.exposed ?? false,
          domain: svc.domain ?? null,
          exposureMethod: svc.exposureMethod ?? 'dns',
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }

    // Link app to project
    db.update(projects)
      .set({ appId, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    // Return updated project
    const updated = db.select().from(projects).where(eq(projects.id, projectId)).get()!
    const appRow = db.select().from(apps).where(eq(apps.id, appId)).get()!
    const services = db.select().from(appServices).where(eq(appServices.appId, appId)).all()

    const tab = project.terminalTabId
      ? db.select().from(terminalTabs).where(eq(terminalTabs.id, project.terminalTabId)).get()
      : null

    return c.json(buildProjectWithDetails(updated, repo, appRow, services, tab ?? null), 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create app' }, 400)
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

// POST /api/projects/scan - Scan directory for git repositories and check if projects exist
// Returns which repos have projects vs just repositories vs neither
app.post('/scan', async (c) => {
  try {
    const body = await c.req.json<{ directory?: string }>().catch(() => ({}))
    const { existsSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { getSettings, expandPath } = await import('../lib/settings')

    // Default to configured git repos directory, expand tilde if present
    const settings = getSettings()
    const directory = expandPath(body.directory || settings.paths.defaultGitReposDir)

    if (!existsSync(directory)) {
      return c.json({ error: `Directory does not exist: ${directory}` }, 400)
    }

    // Get all repositories with their project status
    const allRepos = db.select().from(repositories).all()
    const repoPathMap = new Map(allRepos.map((r) => [r.path, r]))

    // Get all projects to check which repos have projects
    const allProjects = db.select().from(projects).all()
    const repoIdWithProject = new Set(
      allProjects.filter((p) => p.repositoryId).map((p) => p.repositoryId)
    )

    // Scan immediate subdirectories for .git folders
    const discovered: Array<{
      path: string
      name: string
      hasRepository: boolean
      hasProject: boolean
    }> = []

    const entries = readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue

      const subPath = join(directory, entry.name)
      const gitPath = join(subPath, '.git')

      if (existsSync(gitPath)) {
        const existingRepo = repoPathMap.get(subPath)
        discovered.push({
          path: subPath,
          name: entry.name,
          hasRepository: !!existingRepo,
          hasProject: existingRepo ? repoIdWithProject.has(existingRepo.id) : false,
        })
      }
    }

    // Sort by name
    discovered.sort((a, b) => a.name.localeCompare(b.name))

    return c.json({ directory, repositories: discovered })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to scan directory' }, 500)
  }
})

// POST /api/projects/bulk - Bulk create projects from repository paths
// Creates repositories if they don't exist, then creates projects for each
app.post('/bulk', async (c) => {
  try {
    const body = await c.req.json<{
      repositories: Array<{ path: string; displayName?: string }>
    }>()

    if (!body.repositories || !Array.isArray(body.repositories) || body.repositories.length === 0) {
      return c.json({ error: 'repositories array is required' }, 400)
    }

    const { existsSync } = await import('node:fs')
    const { expandPath } = await import('../lib/settings')

    const now = new Date().toISOString()
    const createdProjects: ProjectWithDetails[] = []
    let skipped = 0

    for (const repoInput of body.repositories) {
      const repoPath = expandPath(repoInput.path)

      // Check if repo path exists on disk
      if (!existsSync(repoPath)) {
        skipped++
        continue
      }

      // Check if repository already exists
      let repo = db.select().from(repositories).where(eq(repositories.path, repoPath)).get()

      // Create repository if it doesn't exist
      if (!repo) {
        const displayName = repoInput.displayName || repoPath.split('/').pop() || 'repo'
        const repoId = nanoid()

        db.insert(repositories)
          .values({
            id: repoId,
            path: repoPath,
            displayName,
            startupScript: null,
            copyFiles: null,
            isCopierTemplate: false,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        repo = db.select().from(repositories).where(eq(repositories.id, repoId)).get()
      }

      if (!repo) {
        skipped++
        continue
      }

      // Check if project already exists for this repository
      const existingProject = db.select().from(projects).where(eq(projects.repositoryId, repo.id)).get()
      if (existingProject) {
        skipped++
        continue
      }

      // Check if there's an app linked to this repository
      const linkedApp = db.select().from(apps).where(eq(apps.repositoryId, repo.id)).get()

      // Create project
      const projectId = nanoid()
      db.insert(projects)
        .values({
          id: projectId,
          name: repo.displayName,
          description: null,
          repositoryId: repo.id,
          appId: linkedApp?.id ?? null,
          terminalTabId: null,
          status: 'active',
          lastAccessedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      // Fetch the created project
      const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
      if (project) {
        const services = linkedApp
          ? db.select().from(appServices).where(eq(appServices.appId, linkedApp.id)).all()
          : []

        createdProjects.push(
          buildProjectWithDetails(project, repo, linkedApp ?? null, services, null)
        )
      }
    }

    return c.json({
      created: createdProjects,
      skipped,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to bulk create projects' }, 500)
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

// GET /api/projects/:id/repositories - List repositories for a project
app.get('/:id/repositories', (c) => {
  const projectId = c.req.param('id')

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const repos = getProjectRepositories(projectId, project.repositoryId)
  return c.json(repos)
})

// POST /api/projects/:id/repositories - Add a repository to a project
app.post('/:id/repositories', async (c) => {
  const projectId = c.req.param('id')

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const body = await c.req.json<{ repositoryId: string; isPrimary?: boolean }>()
    if (!body.repositoryId) {
      return c.json({ error: 'repositoryId is required' }, 400)
    }

    // Verify repository exists
    const repo = db.select().from(repositories).where(eq(repositories.id, body.repositoryId)).get()
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    // Check if already linked
    const existing = db
      .select()
      .from(projectRepositories)
      .where(
        and(
          eq(projectRepositories.projectId, projectId),
          eq(projectRepositories.repositoryId, body.repositoryId)
        )
      )
      .get()

    if (existing) {
      return c.json({ error: 'Repository already linked to this project' }, 400)
    }

    const now = new Date().toISOString()

    // If setting as primary, unset other primaries first
    if (body.isPrimary) {
      db.update(projectRepositories)
        .set({ isPrimary: false })
        .where(eq(projectRepositories.projectId, projectId))
        .run()
    }

    const newLink = {
      id: nanoid(),
      projectId,
      repositoryId: body.repositoryId,
      isPrimary: body.isPrimary ?? false,
      createdAt: now,
    }

    db.insert(projectRepositories).values(newLink).run()

    // Update project's lastAccessedAt
    db.update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    broadcast({ type: 'project:updated', payload: { projectId } })

    return c.json(newLink, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to add repository' }, 400)
  }
})

// DELETE /api/projects/:id/repositories/:repoId - Remove a repository from a project
app.delete('/:id/repositories/:repoId', (c) => {
  const projectId = c.req.param('id')
  const repoId = c.req.param('repoId')

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const link = db
    .select()
    .from(projectRepositories)
    .where(
      and(
        eq(projectRepositories.projectId, projectId),
        eq(projectRepositories.repositoryId, repoId)
      )
    )
    .get()

  if (!link) {
    return c.json({ error: 'Repository not linked to this project' }, 404)
  }

  db.delete(projectRepositories).where(eq(projectRepositories.id, link.id)).run()

  const now = new Date().toISOString()
  db.update(projects)
    .set({ updatedAt: now })
    .where(eq(projects.id, projectId))
    .run()

  broadcast({ type: 'project:updated', payload: { projectId } })

  return c.json({ success: true })
})

// PATCH /api/projects/:id/repositories/:repoId - Update repository link (e.g., set as primary)
app.patch('/:id/repositories/:repoId', async (c) => {
  const projectId = c.req.param('id')
  const repoId = c.req.param('repoId')

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const link = db
      .select()
      .from(projectRepositories)
      .where(
        and(
          eq(projectRepositories.projectId, projectId),
          eq(projectRepositories.repositoryId, repoId)
        )
      )
      .get()

    if (!link) {
      return c.json({ error: 'Repository not linked to this project' }, 404)
    }

    const body = await c.req.json<{ isPrimary?: boolean }>()

    // If setting as primary, unset other primaries first
    if (body.isPrimary) {
      db.update(projectRepositories)
        .set({ isPrimary: false })
        .where(eq(projectRepositories.projectId, projectId))
        .run()
    }

    db.update(projectRepositories)
      .set({ isPrimary: body.isPrimary ?? link.isPrimary })
      .where(eq(projectRepositories.id, link.id))
      .run()

    const now = new Date().toISOString()
    db.update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    broadcast({ type: 'project:updated', payload: { projectId } })

    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update repository' }, 400)
  }
})

// GET /api/projects/:id/tags - Get tags for a project
app.get('/:id/tags', (c) => {
  const projectId = c.req.param('id')

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(getProjectTags(projectId))
})

// POST /api/projects/:id/tags - Add a tag to a project
app.post('/:id/tags', async (c) => {
  const projectId = c.req.param('id')

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    const body = await c.req.json<{ tagId?: string; name?: string; color?: string }>()

    let tagId = body.tagId

    // If no tagId provided, create or find tag by name
    if (!tagId && body.name) {
      const name = body.name.trim()
      if (!name) {
        return c.json({ error: 'Tag name cannot be empty' }, 400)
      }

      // Check if tag exists
      const existing = db.select().from(tags).where(eq(tags.name, name)).get()
      if (existing) {
        tagId = existing.id
      } else {
        // Create new tag
        const now = new Date().toISOString()
        tagId = nanoid()
        db.insert(tags)
          .values({
            id: tagId,
            name,
            color: body.color?.trim() || null,
            createdAt: now,
          })
          .run()
      }
    }

    if (!tagId) {
      return c.json({ error: 'tagId or name is required' }, 400)
    }

    // Verify tag exists
    const tag = db.select().from(tags).where(eq(tags.id, tagId)).get()
    if (!tag) {
      return c.json({ error: 'Tag not found' }, 404)
    }

    // Check if already linked
    const existing = db
      .select()
      .from(projectTags)
      .where(
        and(
          eq(projectTags.projectId, projectId),
          eq(projectTags.tagId, tagId)
        )
      )
      .get()

    if (existing) {
      // Already linked, just return the tag
      return c.json({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt,
      })
    }

    const now = new Date().toISOString()
    db.insert(projectTags)
      .values({
        id: nanoid(),
        projectId,
        tagId,
        createdAt: now,
      })
      .run()

    db.update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId))
      .run()

    broadcast({ type: 'project:updated', payload: { projectId } })

    return c.json({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
    }, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to add tag' }, 400)
  }
})

// DELETE /api/projects/:id/tags/:tagId - Remove a tag from a project
app.delete('/:id/tags/:tagId', (c) => {
  const projectId = c.req.param('id')
  const tagId = c.req.param('tagId')

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const link = db
    .select()
    .from(projectTags)
    .where(
      and(
        eq(projectTags.projectId, projectId),
        eq(projectTags.tagId, tagId)
      )
    )
    .get()

  if (!link) {
    return c.json({ error: 'Tag not linked to this project' }, 404)
  }

  db.delete(projectTags).where(eq(projectTags.id, link.id)).run()

  const now = new Date().toISOString()
  db.update(projects)
    .set({ updatedAt: now })
    .where(eq(projects.id, projectId))
    .run()

  broadcast({ type: 'project:updated', payload: { projectId } })

  return c.json({ success: true })
})

export default app
