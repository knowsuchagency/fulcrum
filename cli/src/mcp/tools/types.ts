/**
 * Shared types and schemas for MCP tools
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FulcrumClient } from '../../client'

export type ToolRegistrar = (server: McpServer, client: FulcrumClient) => void

export const TaskStatusSchema = z.enum(['TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED'])
export const ProjectStatusSchema = z.enum(['active', 'archived'])
export const AppStatusSchema = z.enum(['stopped', 'building', 'running', 'failed'])
export const ToolCategorySchema = z.enum([
  'core',
  'tasks',
  'projects',
  'repositories',
  'apps',
  'filesystem',
  'git',
  'notifications',
  'exec',
  'settings',
  'backup',
  'email',
])
export const AgentTypeSchema = z.enum(['claude', 'opencode'])
