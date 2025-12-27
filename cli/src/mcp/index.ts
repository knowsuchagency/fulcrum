import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'
import { ViboraClient } from '../client'

/**
 * Run the Vibora MCP server over stdio transport.
 * Exposes task management operations as MCP tools.
 */
export async function runMcpServer(urlOverride?: string, portOverride?: string) {
  const client = new ViboraClient(urlOverride, portOverride)

  const server = new McpServer({
    name: 'vibora',
    version: '1.0.0',
  })

  registerTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
