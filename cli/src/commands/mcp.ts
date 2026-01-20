/**
 * Handle the 'fulcrum mcp' command.
 * Starts the MCP server over stdio for integration with Claude Desktop and other MCP clients.
 */
export async function handleMcpCommand(flags: Record<string, string>) {
  const { runMcpServer } = await import('../mcp/index')
  await runMcpServer(flags.url, flags.port)
}
