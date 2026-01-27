/**
 * Backup & Restore MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerBackupTools: ToolRegistrar = (server, client) => {
  // list_backups
  server.tool(
    'list_backups',
    'List all available backups of the Fulcrum database and settings.',
    {},
    async () => {
      try {
        const result = await client.listBackups()
        return formatSuccess({
          ...result,
          count: result.backups.length,
          hint:
            result.backups.length > 0
              ? 'Use restore_backup with a backup name to restore'
              : 'No backups found. Use create_backup to create one.',
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_backup
  server.tool(
    'create_backup',
    'Create a backup of the Fulcrum database and settings. Backups are stored in ~/.fulcrum/backups/ with timestamps.',
    {
      description: z.optional(z.string()).describe('Optional description for this backup'),
    },
    async ({ description }) => {
      try {
        const result = await client.createBackup(description)
        return formatSuccess({
          ...result,
          message: `Backup created: ${result.name}`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_backup
  server.tool(
    'get_backup',
    'Get details of a specific backup including what files it contains.',
    {
      name: z
        .string()
        .describe('Backup name (timestamp format like 2024-01-15T10-30-00-000Z)'),
    },
    async ({ name }) => {
      try {
        const result = await client.getBackup(name)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // restore_backup
  server.tool(
    'restore_backup',
    'Restore the database and/or settings from a backup. Creates an automatic pre-restore backup first. Server restart may be needed after database restore.',
    {
      name: z.string().describe('Backup name to restore from'),
      database: z.optional(z.boolean()).describe('Restore the database (default: true)'),
      settings: z.optional(z.boolean()).describe('Restore settings (default: true)'),
    },
    async ({ name, database, settings }) => {
      try {
        const result = await client.restoreBackup(name, { database, settings })
        return formatSuccess({
          ...result,
          message: result.success
            ? `Restored from backup: ${name}${result.preRestoreBackup ? `. Pre-restore backup: ${result.preRestoreBackup}` : ''}`
            : 'Restore failed',
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_backup
  server.tool(
    'delete_backup',
    'Delete a backup to free up disk space.',
    {
      name: z.string().describe('Backup name to delete'),
    },
    async ({ name }) => {
      try {
        const result = await client.deleteBackup(name)
        return formatSuccess({
          ...result,
          message: `Deleted backup: ${name}`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
