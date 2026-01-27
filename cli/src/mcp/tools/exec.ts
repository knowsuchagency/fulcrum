/**
 * Command execution MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerExecTools: ToolRegistrar = (server, client) => {
  // execute_command
  server.tool(
    'execute_command',
    'Execute a CLI command on the remote Fulcrum server. Supports persistent sessions for stateful workflows where environment variables, working directory, and shell state are preserved between commands.',
    {
      command: z.string().describe('The shell command to execute'),
      sessionId: z
        .optional(z.string())
        .describe(
          'Session ID for stateful workflows. Omit to create a new session. Reuse to maintain shell state.'
        ),
      cwd: z
        .optional(z.string())
        .describe('Initial working directory (only used when creating a new session)'),
      timeout: z
        .optional(z.number())
        .describe('Timeout in milliseconds (default: 30000). Use longer timeouts for slow commands.'),
      name: z
        .optional(z.string())
        .describe('Optional session name for identification (only used when creating a new session)'),
    },
    async ({ command, sessionId, cwd, timeout, name }) => {
      try {
        const result = await client.executeCommand(command, { sessionId, cwd, timeout, name })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_exec_sessions
  server.tool(
    'list_exec_sessions',
    'List all active command execution sessions on the Fulcrum server',
    {},
    async () => {
      try {
        const sessions = await client.listExecSessions()
        return formatSuccess(sessions)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_exec_session
  server.tool(
    'update_exec_session',
    'Update an existing command execution session (e.g., rename it)',
    {
      sessionId: z.string().describe('The session ID to update'),
      name: z.optional(z.string()).describe('New name for the session'),
    },
    async ({ sessionId, name }) => {
      try {
        const result = await client.updateExecSession(sessionId, { name })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // destroy_exec_session
  server.tool(
    'destroy_exec_session',
    'Destroy an active command execution session to free resources',
    {
      sessionId: z.string().describe('The session ID to destroy'),
    },
    async ({ sessionId }) => {
      try {
        const result = await client.destroyExecSession(sessionId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
