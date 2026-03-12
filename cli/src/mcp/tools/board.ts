/**
 * Board MCP tools - Agent coordination board
 *
 * Direct filesystem operations — no server API needed.
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'
import { readBoard, postMessage, checkResource } from '../../board'
import type { MessageType } from '../../board/types'

export const registerBoardTools: ToolRegistrar = (server, _client) => {
  server.tool(
    'board_read',
    'Read the agent coordination board. Returns recent messages from other agents working in the same project. Use before claiming resources (ports, services) to avoid conflicts.',
    {
      since: z.optional(z.string()).describe('Time window, e.g. "1h", "30m", "2h". Default: "1h"'),
      type: z.optional(z.enum(['claim', 'release', 'info', 'warning', 'request'])).describe('Filter by message type'),
      project: z.optional(z.string()).describe('Filter by project name'),
      tag: z.optional(z.string()).describe('Filter by tag, e.g. "port:5173"'),
      limit: z.optional(z.number().min(1).max(200)).describe('Max messages to return (default: 50)'),
    },
    async ({ since, type, project, tag, limit }) => {
      try {
        const messages = readBoard({
          since,
          type: type as MessageType | undefined,
          project,
          tag,
          limit,
        })
        return formatSuccess(messages)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  server.tool(
    'board_post',
    'Post a message to the agent coordination board. Announce resource claims, share status updates, or coordinate with other agents working on the same project.',
    {
      body: z.string().describe('Message body describing what you are doing or claiming'),
      type: z.optional(z.enum(['claim', 'release', 'info', 'warning', 'request'])).describe('Message type. Default: "info". Use "claim" to reserve resources, "release" to free them.'),
      tags: z.optional(z.array(z.string())).describe('Tags for categorization and resource matching, e.g. ["port:5173", "dev-server"]'),
      ttl: z.optional(z.number()).describe('Time-to-live in seconds. Defaults vary by type: claim=7200, release=300, info=3600'),
      refContent: z.optional(z.string()).describe('Large content to store as a ref file (e.g., error logs)'),
    },
    async ({ body, type, tags, ttl, refContent }) => {
      try {
        const message = await postMessage({
          body,
          type: type as MessageType | undefined,
          tags,
          ttl,
          refContent,
        })
        return formatSuccess(message)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  server.tool(
    'board_check',
    'Check if a resource is claimed by another agent. Returns the active claim if found, null if the resource is free. Use before starting dev servers, database operations, etc.',
    {
      resource: z.string().describe('Resource tag to check, e.g. "port:5173", "db:migration"'),
    },
    async ({ resource }) => {
      try {
        const claim = checkResource(resource)
        return formatSuccess(claim ? { claimed: true, claim } : { claimed: false })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
