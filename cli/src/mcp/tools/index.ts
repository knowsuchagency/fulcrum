/**
 * MCP Tools - Modular tool registration
 *
 * Tools are organized by category into separate modules for maintainability.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FulcrumClient } from '../../client'

import { registerCoreTools } from './core'
import { registerTaskTools } from './tasks'
import { registerRepositoryTools } from './repositories'
import { registerNotificationTools } from './notifications'
import { registerExecTools } from './exec'
import { registerProjectTools } from './projects'
import { registerAppTools } from './apps'
import { registerFilesystemTools } from './filesystem'
import { registerSettingsTools } from './settings'
import { registerBackupTools } from './backup'
import { registerEmailTools } from './email'

export function registerTools(server: McpServer, client: FulcrumClient) {
  registerCoreTools(server, client)
  registerTaskTools(server, client)
  registerRepositoryTools(server, client)
  registerNotificationTools(server, client)
  registerExecTools(server, client)
  registerProjectTools(server, client)
  registerAppTools(server, client)
  registerFilesystemTools(server, client)
  registerSettingsTools(server, client)
  registerBackupTools(server, client)
  registerEmailTools(server, client)
}

// Re-export types and schemas for external use
export * from './types'
