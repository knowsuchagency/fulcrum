import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apps, repositories } from '../db/schema'
import { deployApp } from './deployment'
import { log } from '../lib/logger'

interface WatchedRepo {
  repoId: string
  repoPath: string
  branch: string
  appIds: string[]
  watcher: fs.FSWatcher | null
  lastCommit: string | null
}

// Map of repository path -> WatchedRepo
const watchedRepos = new Map<string, WatchedRepo>()

// Debounce timer to prevent multiple rapid triggers
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 2000

// Track apps currently being deployed to prevent parallel deploys
const deployingApps = new Set<string>()

/**
 * Get the current HEAD commit for a branch
 */
function getCurrentCommit(repoPath: string, branch: string): string | null {
  const refPath = path.join(repoPath, '.git', 'refs', 'heads', branch)
  try {
    return fs.readFileSync(refPath, 'utf-8').trim()
  } catch {
    // Branch ref might not exist yet or be a packed ref
    try {
      // Check packed-refs
      const packedRefsPath = path.join(repoPath, '.git', 'packed-refs')
      if (fs.existsSync(packedRefsPath)) {
        const content = fs.readFileSync(packedRefsPath, 'utf-8')
        const regex = new RegExp(`^([a-f0-9]+) refs/heads/${branch}$`, 'm')
        const match = content.match(regex)
        if (match) return match[1]
      }
    } catch {
      // Ignore
    }
    return null
  }
}

/**
 * Handle a git ref change
 */
async function handleRefChange(repoPath: string): Promise<void> {
  const watched = watchedRepos.get(repoPath)
  if (!watched) return

  const currentCommit = getCurrentCommit(repoPath, watched.branch)
  if (!currentCommit || currentCommit === watched.lastCommit) {
    return // No change
  }

  log.deploy.info('Git ref changed, checking for auto-deploy apps', {
    repoPath,
    branch: watched.branch,
    oldCommit: watched.lastCommit?.slice(0, 7),
    newCommit: currentCommit.slice(0, 7),
  })

  watched.lastCommit = currentCommit

  // Find apps that use this repository and have auto-deploy enabled
  for (const appId of watched.appIds) {
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    })

    if (!app || !app.autoDeployEnabled) {
      continue
    }

    // Check if the app's branch matches the changed branch
    if (app.branch !== watched.branch) {
      continue
    }

    // Skip if already deploying this app
    if (deployingApps.has(appId)) {
      log.deploy.info('Skipping auto-deploy - already in progress', { appId })
      continue
    }

    log.deploy.info('Triggering auto-deploy', {
      appId,
      appName: app.name,
      branch: watched.branch,
      commit: currentCommit.slice(0, 7),
    })

    // Mark as deploying and deploy asynchronously
    deployingApps.add(appId)
    deployApp(appId, { deployedBy: 'auto' })
      .catch((err) => {
        log.deploy.error('Auto-deploy failed', {
          appId,
          error: String(err),
        })
      })
      .finally(() => {
        deployingApps.delete(appId)
      })
  }
}

/**
 * Start watching a repository for changes
 */
function watchRepo(repoId: string, repoPath: string, branch: string, appId: string): void {
  const key = repoPath

  if (watchedRepos.has(key)) {
    // Already watching, just add the app
    const watched = watchedRepos.get(key)!
    if (!watched.appIds.includes(appId)) {
      watched.appIds.push(appId)
    }
    log.deploy.debug('Added app to existing git watcher', {
      repoPath,
      appId,
      totalApps: watched.appIds.length,
    })
    return
  }

  // Get initial commit
  const lastCommit = getCurrentCommit(repoPath, branch)

  const watched: WatchedRepo = {
    repoId,
    repoPath,
    branch,
    appIds: [appId],
    watcher: null,
    lastCommit,
  }

  // Watch the refs/heads directory for changes
  const refsPath = path.join(repoPath, '.git', 'refs', 'heads')

  try {
    if (!fs.existsSync(refsPath)) {
      log.deploy.warn('Git refs path does not exist', { refsPath })
      return
    }

    // Watch the entire refs/heads directory
    const watcher = fs.watch(refsPath, { persistent: true }, (eventType, filename) => {
      log.deploy.debug('fs.watch event', { refsPath, eventType, filename, branch })

      // Only trigger on the branch we care about
      // Git writes to main.lock then renames to main, so accept both
      if (filename !== branch && filename !== `${branch}.lock`) return

      // Debounce to prevent multiple rapid triggers
      const timerKey = `${repoPath}:${branch}`
      if (debounceTimers.has(timerKey)) {
        clearTimeout(debounceTimers.get(timerKey))
      }

      debounceTimers.set(
        timerKey,
        setTimeout(() => {
          debounceTimers.delete(timerKey)
          handleRefChange(repoPath).catch((err) => {
            log.deploy.error('Failed to handle git ref change', {
              repoPath,
              error: String(err),
            })
          })
        }, DEBOUNCE_MS)
      )
    })

    watcher.on('error', (err) => {
      log.deploy.error('Git watcher error', { repoPath, error: String(err) })
    })

    watched.watcher = watcher
    watchedRepos.set(key, watched)

    log.deploy.info('Started watching git repository', {
      repoPath,
      branch,
      appId,
      currentCommit: lastCommit?.slice(0, 7),
    })
  } catch (err) {
    log.deploy.error('Failed to start git watcher', {
      repoPath,
      error: String(err),
    })
  }
}

/**
 * Stop watching a repository for an app
 */
export function unwatchRepo(repoPath: string, appId: string): void {
  const watched = watchedRepos.get(repoPath)
  if (!watched) return

  watched.appIds = watched.appIds.filter((id) => id !== appId)

  if (watched.appIds.length === 0) {
    // No more apps using this repo, stop watching
    if (watched.watcher) {
      watched.watcher.close()
    }
    watchedRepos.delete(repoPath)
    log.deploy.info('Stopped watching git repository', { repoPath })
  }
}

/**
 * Refresh watchers based on current apps in database
 * Call this on startup and when apps are created/updated/deleted
 */
export async function refreshGitWatchers(): Promise<void> {
  // Get all apps with auto-deploy enabled
  const autoDeployApps = await db.query.apps.findMany({
    where: eq(apps.autoDeployEnabled, true),
  })

  // Get current watched repos
  const currentWatched = new Set(watchedRepos.keys())

  // Track which repos should be watched
  const shouldWatch = new Map<string, { repoId: string; branch: string; appIds: string[] }>()

  for (const app of autoDeployApps) {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, app.repositoryId),
    })

    if (!repo || !fs.existsSync(repo.path)) {
      continue
    }

    const key = repo.path
    if (shouldWatch.has(key)) {
      shouldWatch.get(key)!.appIds.push(app.id)
    } else {
      shouldWatch.set(key, {
        repoId: repo.id,
        branch: app.branch,
        appIds: [app.id],
      })
    }
  }

  // Stop watching repos that no longer need watching
  for (const repoPath of currentWatched) {
    if (!shouldWatch.has(repoPath)) {
      const watched = watchedRepos.get(repoPath)
      if (watched?.watcher) {
        watched.watcher.close()
      }
      watchedRepos.delete(repoPath)
      log.deploy.info('Stopped watching git repository (no auto-deploy apps)', { repoPath })
    }
  }

  // Start watching new repos or update existing
  for (const [repoPath, config] of shouldWatch) {
    for (const appId of config.appIds) {
      watchRepo(config.repoId, repoPath, config.branch, appId)
    }
  }

  log.deploy.info('Git watchers refreshed', {
    watchedRepos: watchedRepos.size,
    autoDeployApps: autoDeployApps.length,
  })
}

/**
 * Start the git watcher service
 * This initializes watchers for all apps with auto-deploy enabled
 */
export async function startGitWatcher(): Promise<void> {
  log.deploy.info('Git Watcher starting')
  await refreshGitWatchers()
}

/**
 * Stop the git watcher service
 */
export function stopGitWatcher(): void {
  for (const watched of watchedRepos.values()) {
    if (watched.watcher) {
      watched.watcher.close()
    }
  }
  watchedRepos.clear()
  debounceTimers.forEach((timer) => clearTimeout(timer))
  debounceTimers.clear()
  log.deploy.info('Git Watcher stopped')
}
