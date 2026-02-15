import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import { getFulcrumDir, getDatabasePath } from '../lib/settings'
import { initFnoxConfig } from '../lib/settings/fnox'
import { log } from '../lib/logger'

const app = new Hono()

// Backup directory structure:
// ~/.fulcrum/backups/
//   2024-01-15T10-30-00/
//     fulcrum.db
//     fnox.toml
//     age.txt
//     manifest.json  (metadata about the backup)

function getBackupsDir(): string {
  return path.join(getFulcrumDir(), 'backups')
}

function ensureBackupsDir(): void {
  const dir = getBackupsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Generate a timestamp-based backup name
function generateBackupName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

interface BackupManifest {
  createdAt: string
  version: string
  files: {
    database: boolean
    fnoxConfig: boolean
    ageKey: boolean
  }
  databaseSize?: number
  fnoxConfigSize?: number
  description?: string
}

interface BackupInfo {
  name: string
  createdAt: string
  path: string
  manifest: BackupManifest
}

// GET /api/backup - List all backups
app.get('/', (c) => {
  ensureBackupsDir()
  const backupsDir = getBackupsDir()

  const backups: BackupInfo[] = []
  const entries = fs.readdirSync(backupsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const backupPath = path.join(backupsDir, entry.name)
    const manifestPath = path.join(backupPath, 'manifest.json')

    if (!fs.existsSync(manifestPath)) continue

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BackupManifest
      backups.push({
        name: entry.name,
        createdAt: manifest.createdAt,
        path: backupPath,
        manifest,
      })
    } catch {
      // Skip invalid backups
    }
  }

  // Sort by creation date, newest first
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return c.json({ backups, backupsDir })
})

// POST /api/backup - Create a new backup
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{ description?: string }>().catch(() => ({}))

    ensureBackupsDir()
    const backupName = generateBackupName()
    const backupPath = path.join(getBackupsDir(), backupName)
    const fulcrumDir = getFulcrumDir()

    fs.mkdirSync(backupPath, { recursive: true })

    const manifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      files: {
        database: false,
        fnoxConfig: false,
        ageKey: false,
      },
      description: body.description,
    }

    // Copy database
    const dbPath = getDatabasePath()
    if (fs.existsSync(dbPath)) {
      const dbBackupPath = path.join(backupPath, 'fulcrum.db')
      fs.copyFileSync(dbPath, dbBackupPath)
      manifest.files.database = true
      manifest.databaseSize = fs.statSync(dbPath).size

      // Also copy WAL and SHM files if they exist (for SQLite)
      const walPath = `${dbPath}-wal`
      const shmPath = `${dbPath}-shm`
      if (fs.existsSync(walPath)) {
        fs.copyFileSync(walPath, `${dbBackupPath}-wal`)
      }
      if (fs.existsSync(shmPath)) {
        fs.copyFileSync(shmPath, `${dbBackupPath}-shm`)
      }
    }

    // Copy fnox.toml
    const fnoxConfigPath = path.join(fulcrumDir, 'fnox.toml')
    if (fs.existsSync(fnoxConfigPath)) {
      fs.copyFileSync(fnoxConfigPath, path.join(backupPath, 'fnox.toml'))
      manifest.files.fnoxConfig = true
      manifest.fnoxConfigSize = fs.statSync(fnoxConfigPath).size
    }

    // Copy age.txt
    const ageKeyPath = path.join(fulcrumDir, 'age.txt')
    if (fs.existsSync(ageKeyPath)) {
      fs.copyFileSync(ageKeyPath, path.join(backupPath, 'age.txt'))
      // Preserve restrictive permissions
      fs.chmodSync(path.join(backupPath, 'age.txt'), 0o600)
      manifest.files.ageKey = true
    }

    // Write manifest
    fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2))

    log.system.info('Backup created', { backupName, manifest })

    return c.json({
      success: true,
      name: backupName,
      path: backupPath,
      manifest,
    })
  } catch (err) {
    log.system.error('Failed to create backup', { error: err })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create backup' }, 500)
  }
})

// GET /api/backup/:name - Get details of a specific backup
app.get('/:name', (c) => {
  const name = c.req.param('name')
  const backupPath = path.join(getBackupsDir(), name)
  const manifestPath = path.join(backupPath, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    return c.json({ error: 'Backup not found' }, 404)
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BackupManifest
    return c.json({
      name,
      path: backupPath,
      manifest,
    })
  } catch {
    return c.json({ error: 'Invalid backup manifest' }, 500)
  }
})

// POST /api/backup/:name/restore - Restore from a specific backup
app.post('/:name/restore', async (c) => {
  const name = c.req.param('name')
  const backupPath = path.join(getBackupsDir(), name)
  const manifestPath = path.join(backupPath, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    return c.json({ error: 'Backup not found' }, 404)
  }

  try {
    const body = await c.req.json<{ database?: boolean; config?: boolean }>().catch(() => ({}))
    const restoreDatabase = body.database !== false
    const restoreConfig = body.config !== false

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BackupManifest
    const fulcrumDir = getFulcrumDir()
    const restored: { database: boolean; fnoxConfig: boolean; ageKey: boolean } = {
      database: false,
      fnoxConfig: false,
      ageKey: false,
    }

    // Create a pre-restore backup first
    const preRestoreBackupName = `pre-restore-${generateBackupName()}`
    const preRestoreBackupPath = path.join(getBackupsDir(), preRestoreBackupName)
    fs.mkdirSync(preRestoreBackupPath, { recursive: true })

    const preRestoreManifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      files: { database: false, fnoxConfig: false, ageKey: false },
      description: `Auto-backup before restoring from ${name}`,
    }

    // Restore database
    if (restoreDatabase && manifest.files.database) {
      const dbBackupPath = path.join(backupPath, 'fulcrum.db')
      const dbPath = getDatabasePath()

      if (fs.existsSync(dbBackupPath)) {
        // Backup current database first
        if (fs.existsSync(dbPath)) {
          fs.copyFileSync(dbPath, path.join(preRestoreBackupPath, 'fulcrum.db'))
          preRestoreManifest.files.database = true
        }

        // Restore database
        fs.copyFileSync(dbBackupPath, dbPath)

        // Also restore WAL and SHM files if they exist
        const walBackupPath = `${dbBackupPath}-wal`
        const shmBackupPath = `${dbBackupPath}-shm`
        if (fs.existsSync(walBackupPath)) {
          fs.copyFileSync(walBackupPath, `${dbPath}-wal`)
        } else if (fs.existsSync(`${dbPath}-wal`)) {
          fs.unlinkSync(`${dbPath}-wal`)
        }
        if (fs.existsSync(shmBackupPath)) {
          fs.copyFileSync(shmBackupPath, `${dbPath}-shm`)
        } else if (fs.existsSync(`${dbPath}-shm`)) {
          fs.unlinkSync(`${dbPath}-shm`)
        }

        restored.database = true
      }
    }

    // Restore fnox config and age key
    if (restoreConfig) {
      const fnoxConfigBackup = path.join(backupPath, 'fnox.toml')
      const fnoxConfigPath = path.join(fulcrumDir, 'fnox.toml')
      if (manifest.files.fnoxConfig && fs.existsSync(fnoxConfigBackup)) {
        // Backup current
        if (fs.existsSync(fnoxConfigPath)) {
          fs.copyFileSync(fnoxConfigPath, path.join(preRestoreBackupPath, 'fnox.toml'))
          preRestoreManifest.files.fnoxConfig = true
        }
        fs.copyFileSync(fnoxConfigBackup, fnoxConfigPath)
        restored.fnoxConfig = true
      }

      const ageKeyBackup = path.join(backupPath, 'age.txt')
      const ageKeyPath = path.join(fulcrumDir, 'age.txt')
      if (manifest.files.ageKey && fs.existsSync(ageKeyBackup)) {
        // Backup current
        if (fs.existsSync(ageKeyPath)) {
          fs.copyFileSync(ageKeyPath, path.join(preRestoreBackupPath, 'age.txt'))
          preRestoreManifest.files.ageKey = true
        }
        fs.copyFileSync(ageKeyBackup, ageKeyPath)
        fs.chmodSync(ageKeyPath, 0o600)
        restored.ageKey = true
      }

      // Reinitialize fnox cache after restore
      if (restored.fnoxConfig || restored.ageKey) {
        initFnoxConfig()
      }
    }

    // Save pre-restore backup manifest if any files were backed up
    if (preRestoreManifest.files.database || preRestoreManifest.files.fnoxConfig || preRestoreManifest.files.ageKey) {
      fs.writeFileSync(
        path.join(preRestoreBackupPath, 'manifest.json'),
        JSON.stringify(preRestoreManifest, null, 2)
      )
    } else {
      // Remove empty pre-restore backup
      fs.rmSync(preRestoreBackupPath, { recursive: true })
    }

    log.system.info('Backup restored', { backupName: name, restored })

    return c.json({
      success: true,
      restored,
      preRestoreBackup: preRestoreManifest.files.database || preRestoreManifest.files.fnoxConfig || preRestoreManifest.files.ageKey
        ? preRestoreBackupName
        : null,
      warning: restored.database
        ? 'Server restart recommended after database restore'
        : undefined,
    })
  } catch (err) {
    log.system.error('Failed to restore backup', { error: err })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to restore backup' }, 500)
  }
})

// DELETE /api/backup/:name - Delete a backup
app.delete('/:name', (c) => {
  const name = c.req.param('name')
  const backupPath = path.join(getBackupsDir(), name)

  if (!fs.existsSync(backupPath)) {
    return c.json({ error: 'Backup not found' }, 404)
  }

  try {
    fs.rmSync(backupPath, { recursive: true })
    log.system.info('Backup deleted', { backupName: name })
    return c.json({ success: true, deleted: name })
  } catch (err) {
    log.system.error('Failed to delete backup', { error: err })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to delete backup' }, 500)
  }
})

export default app
