import { defineCommand } from 'citty'
import { globalArgs, toFlags } from './shared'

/**
 * Handle the 'fulcrum mcp' command.
 * Starts the MCP server over stdio for integration with Claude Desktop and other MCP clients.
 */
async function handleMcpCommand(flags: Record<string, string>) {
  const { runMcpServer } = await import('../mcp/index')
  await runMcpServer(flags.url, flags.port)
}

// ============================================================================
// Command Definition
// ============================================================================

export const mcpCommand = defineCommand({
  meta: { name: 'mcp', description: 'Start MCP server (stdio)' },
  args: globalArgs,
  async run({ args }) {
    await handleMcpCommand(toFlags(args))
  },
})
