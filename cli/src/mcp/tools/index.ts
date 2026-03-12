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
import { registerCopierTools } from './copier'
import { registerNotificationTools } from './notifications'
import { registerExecTools } from './exec'
import { registerProjectTools } from './projects'
import { registerAppTools } from './apps'
import { registerFilesystemTools } from './filesystem'
import { registerSettingsTools } from './settings'
import { registerBackupTools } from './backup'
import { registerEmailTools } from './email'
import { registerAssistantTools } from './assistant'
import { registerCaldavTools } from './caldav'
import { registerGmailTools } from './gmail'
import { registerMemoryTools } from './memory'
import { registerMemoryFileTools } from './memory-file'
import { registerMessagingTools } from './messaging'
import { registerSearchTools } from './search'
import { registerJobTools } from './jobs'
import { registerBoardTools } from './board'

export function registerTools(server: McpServer, client: FulcrumClient) {
  registerCoreTools(server, client)
  registerTaskTools(server, client)
  registerRepositoryTools(server, client)
  registerCopierTools(server, client)
  registerNotificationTools(server, client)
  registerExecTools(server, client)
  registerProjectTools(server, client)
  registerAppTools(server, client)
  registerFilesystemTools(server, client)
  registerSettingsTools(server, client)
  registerBackupTools(server, client)
  registerEmailTools(server, client)
  registerMessagingTools(server, client)
  registerAssistantTools(server, client)
  registerCaldavTools(server, client)
  registerGmailTools(server, client)
  registerMemoryTools(server, client)
  registerMemoryFileTools(server, client)
  registerSearchTools(server, client)
  registerJobTools(server, client)
  registerBoardTools(server, client)
}

// Re-export types and schemas for external use
export * from './types'
