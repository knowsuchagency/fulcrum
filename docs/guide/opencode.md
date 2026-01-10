# OpenCode

The Vibora integration for OpenCode enables deep integration between your AI coding sessions and task management.

## Installation

Run the following command to install the plugin globally:

```bash
vibora opencode install
```

This installs two components:

1. **Status sync plugin** at `~/.config/opencode/plugin/vibora.ts`
2. **MCP server config** in `~/.opencode/opencode.json`

Both are loaded automatically when you start OpenCode.

## Uninstallation

To remove the Vibora integration:

```bash
vibora opencode uninstall
```

This removes both the plugin file and the MCP server configuration.

## Features

### Automatic Status Sync

When working in a Vibora task:

- **You send a message** → Task moves to "In Progress"
- **Agent finishes/goes idle** → Task moves to "In Review"

This happens automatically—no manual status updates needed.

### MCP Tools

The plugin configures an MCP server that gives OpenCode access to task management tools:

- **Task management** — Create, list, update, and move tasks
- **Repository access** — List configured repositories
- **Notifications** — Send notifications to enabled channels
- **Remote execution** — Execute commands on the Vibora server

See [MCP Tools Reference](/reference/mcp-tools) for the full list of available tools.

### Robust Detection

The plugin automatically detects if it's running within a Vibora task context (via environment variables or directory detection). If running outside a task, it disables itself completely to avoid overhead.

## Troubleshooting

If the plugin doesn't seem to work:

1. Ensure Vibora server is running (`vibora up`).
2. Ensure you installed the plugin (`vibora opencode install`).
3. Restart OpenCode to reload plugins.
4. Check that `~/.opencode/opencode.json` contains the `vibora` MCP entry.

### Manual MCP Configuration

If the automatic installation couldn't modify your `opencode.json` (e.g., due to parse errors), add the MCP server manually:

```json
{
  "mcp": {
    "vibora": {
      "type": "local",
      "command": ["vibora", "mcp"],
      "enabled": true
    }
  }
}
```
