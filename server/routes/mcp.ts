import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools } from '../../cli/src/mcp/tools'
import { FulcrumClient } from '../../cli/src/client'
import { getSettings } from '../lib/settings'

const mcpRoutes = new Hono()

// Handle all MCP HTTP requests (stateless - new transport per request)
mcpRoutes.all('/', async (c) => {
  const settings = getSettings()
  const port = settings.server?.port ?? 7777

  // Create transport in stateless mode (no sessionIdGenerator means stateless)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  // Create MCP server
  const server = new McpServer({
    name: 'fulcrum',
    version: '2.5.4',
  })

  // Client connects back to this server
  const client = new FulcrumClient(`http://localhost:${port}`)
  registerTools(server, client)

  await server.connect(transport)

  return transport.handleRequest(c.req.raw)
})

export default mcpRoutes
