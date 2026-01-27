/**
 * Notification MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerNotificationTools: ToolRegistrar = (server, client) => {
  // send_notification
  server.tool(
    'send_notification',
    'Send a notification to all enabled notification channels',
    {
      title: z.string().describe('Notification title'),
      message: z.string().describe('Notification message body'),
    },
    async ({ title, message }) => {
      try {
        const result = await client.sendNotification(title, message)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
