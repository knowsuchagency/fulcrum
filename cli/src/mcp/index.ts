import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'
import { FulcrumClient } from '../client'

/**
 * Run the Fulcrum MCP server over stdio transport.
 * Exposes task management operations as MCP tools.
 */
export async function runMcpServer(urlOverride?: string, portOverride?: string) {
  const client = new FulcrumClient(urlOverride, portOverride)

  const server = new McpServer({
    name: 'fulcrum',
    version: '2.2.3',
  })

  registerTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
