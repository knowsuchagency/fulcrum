# OpenCode Plugin

The Vibora plugin for OpenCode enables deep integration between your AI coding sessions and task management.

## Installation

Run the following command to install the plugin globally:

```bash
vibora opencode install
```

The plugin will be installed to `~/.config/opencode/plugin/vibora.ts` and loaded automatically when you start OpenCode.

## Features

### Automatic Status Sync

When working in a Vibora task:

- **You send a message** → Task moves to "In Progress"
- **Agent finishes/goes idle** → Task moves to "In Review"

This happens automatically—no manual status updates needed.

### Robust Detection

The plugin automatically detects if it's running within a Vibora task context (via environment variables or directory detection). If running outside a task, it disables itself completely to avoid overhead.

## Troubleshooting

If the plugin doesn't seem to work:

1. Ensure Vibora server is running (`vibora up`).
2. Ensure you installed the plugin (`vibora opencode install`).
3. Restart OpenCode to reload plugins.
