/**
 * Assistant MCP tools - Events, sweeps, stats and messaging
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

const ActionableEventStatusSchema = z.enum(['pending', 'acted_upon', 'dismissed', 'monitoring'])
const ChannelSchema = z.enum(['email', 'whatsapp', 'discord', 'telegram', 'slack', 'all'])

export const registerAssistantEventTools: ToolRegistrar = (server, client) => {
  // message - Send a message to a channel
  server.tool(
    'message',
    'Send a message to a messaging channel (email, WhatsApp, etc.). Use this to reply to messages or send proactive communications.',
    {
      channel: ChannelSchema.describe('Target channel: email, whatsapp, discord, telegram, slack, or all'),
      to: z.string().describe('Recipient (email address, phone number, or channel ID)'),
      body: z.string().describe('Message content'),
      subject: z.optional(z.string()).describe('Email subject (for email channel only)'),
      replyToMessageId: z.optional(z.string()).describe('Message ID to reply to (for threading)'),
    },
    async ({ channel, to, body, subject, replyToMessageId }) => {
      try {
        const result = await client.sendMessage({
          channel,
          to,
          body,
          subject,
          replyToMessageId,
        })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_actionable_event - Create an event to track
  server.tool(
    'create_actionable_event',
    'Create an actionable event to track something noticed (message, request, etc.). Use this to log decisions and maintain memory of things that need attention.',
    {
      source_channel: ChannelSchema.exclude(['all']).describe('Channel where the event originated'),
      source_id: z.string().describe('ID of the source message/email'),
      source_metadata: z.optional(z.record(z.string(), z.any())).describe('Additional context (sender, subject, etc.)'),
      summary: z.optional(z.string()).describe('AI-generated description of what this event is about'),
      status: z.optional(ActionableEventStatusSchema).describe('Event status (default: pending)'),
      linked_task_id: z.optional(z.string()).describe('Fulcrum task ID if this event relates to a task'),
    },
    async ({ source_channel, source_id, source_metadata, summary, status, linked_task_id }) => {
      try {
        const result = await client.createActionableEvent({
          sourceChannel: source_channel,
          sourceId: source_id,
          sourceMetadata: source_metadata,
          summary,
          status,
          linkedTaskId: linked_task_id,
        })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_actionable_events - List tracked events
  server.tool(
    'list_actionable_events',
    'List actionable events. Use this to review what needs attention, check for patterns, or avoid creating duplicates.',
    {
      status: z.optional(ActionableEventStatusSchema).describe('Filter by status'),
      source_channel: z.optional(z.string()).describe('Filter by source channel'),
      limit: z.optional(z.number()).describe('Maximum events to return (default: 50)'),
    },
    async ({ status, source_channel, limit }) => {
      try {
        const result = await client.listActionableEvents({
          status,
          channel: source_channel,
          limit: limit ?? 50,
        })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_actionable_event - Get event details
  server.tool(
    'get_actionable_event',
    'Get details of a specific actionable event including its action log and linked task.',
    {
      id: z.string().describe('Event ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.getActionableEvent(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_actionable_event - Update an event
  server.tool(
    'update_actionable_event',
    'Update an actionable event status, link it to a task, or add to its action log. Use action_log_entry to record decisions/actions taken.',
    {
      id: z.string().describe('Event ID'),
      status: z.optional(ActionableEventStatusSchema).describe('New status'),
      linked_task_id: z.optional(z.string()).describe('Link to a Fulcrum task (use empty string to unlink)'),
      action_log_entry: z.optional(z.string()).describe('Action to log (e.g., "Replied with project update")'),
    },
    async ({ id, status, linked_task_id, action_log_entry }) => {
      try {
        const result = await client.updateActionableEvent(id, {
          status,
          linkedTaskId: linked_task_id === '' ? null : linked_task_id,
          actionLogEntry: action_log_entry,
        })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_assistant_stats - Get overall statistics
  server.tool(
    'get_assistant_stats',
    'Get assistant statistics: event counts by status and last sweep times. Useful for understanding workload and activity.',
    {},
    async () => {
      try {
        const result = await client.getAssistantStats()
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_last_sweep - Get the last sweep run of a type
  server.tool(
    'get_last_sweep',
    'Get information about the last sweep run of a specific type. Useful for context about what was last reviewed.',
    {
      type: z.enum(['hourly', 'morning_ritual', 'evening_ritual']).describe('Type of sweep'),
    },
    async ({ type }) => {
      try {
        const result = await client.getLastSweepRun(type)
        return formatSuccess(result || { message: 'No sweep of this type has run yet' })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
