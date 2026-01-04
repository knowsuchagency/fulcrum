# Quick Start

Get Vibora running in under a minute.

## Installation

### Using npx (Recommended)

```bash
npx vibora@latest up
```

Vibora will:
- Check for required dependencies (bun, dtach, AI agent CLI, uv)
- Offer to install any that are missing
- Start the server on http://localhost:7777
- Show getting started tips

Open [http://localhost:7777](http://localhost:7777) in your browser.

### Check Your Setup

```bash
vibora doctor
```

Shows the status of all dependencies with versions.

### Desktop App

Download the desktop app for a bundled experience:

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [Download DMG](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-macos-arm64.dmg) |
| **Linux** | [Download AppImage](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-linux-x64.AppImage) |

The desktop app bundles everything—just install and run. It will start the server, install the Claude Code plugin, and check for updates automatically.

::: details macOS Installation Notes
1. Open the DMG and drag Vibora to Applications
2. On first launch, macOS will block the app
3. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**
4. Confirm by clicking **Open Anyway** in the dialog
:::

### Install Script (Recommended for Remote Servers)

For remote servers or VPS, use the install script—it auto-installs all dependencies:

```bash
curl -fsSL https://raw.githubusercontent.com/knowsuchagency/vibora/main/install.sh | bash
```

This installs bun, dtach, uv, Claude Code, OpenCode, GitHub CLI, Docker, cloudflared, and the vibora CLI + Claude Code plugin.

## Dependencies

### Required

These must be installed for Vibora to work:

| Dependency | Purpose |
|------------|---------|
| **git** | Version control (must be pre-installed) |
| **bun** | JavaScript runtime |
| **dtach** | Terminal session persistence |

### AI Agents (at least one required)

| Agent | Description |
|-------|-------------|
| **Claude Code** | Anthropic's CLI coding agent with deep MCP integration |
| **OpenCode** | Open-source coding agent with GPT-4 and other model support |

Configure your preferred agent in Settings > Agent.

### Optional

These enable additional features:

| Dependency | Feature |
|------------|---------|
| **uv** | Python package manager for Python-based skills |
| **gh** (GitHub CLI) | PR creation and GitHub integration |
| **Docker** | App deployment with Docker Compose |
| **cloudflared** | Cloudflare tunnels for secure remote access |

Check your setup:

```bash
vibora doctor
```

## Install the Claude Code Plugin

For automatic status sync and task management:

```bash
claude plugin marketplace add knowsuchagency/vibora
claude plugin install vibora@vibora --scope user
```

The plugin enables:
- **Automatic Status Sync** — Task moves to "In Review" when Claude stops, "In Progress" when you respond
- **Slash Commands** — `/review`, `/pr`, `/notify`, `/linear`, `/task-info`
- **MCP Server** — Task management tools available directly to Claude

## Creating Your First Task

1. Navigate to the **Repositories** view and add a repository
2. Click **New Task** on the repository
3. Enter a task name (e.g., "Add user authentication")
4. Vibora creates an isolated git worktree and opens a terminal

![Create New Task](/screenshots/create-new-task-dialog.png)

Your task is now running in its own worktree. You can:
- Open it in your editor
- Start your AI agent in the terminal
- Track progress on the Kanban board

## Next Steps

- [Tasks & Worktrees](/guide/tasks) - Learn about task management
- [Remote Server](/guide/remote-server) - Run agents on a remote server
- [Claude Plugin](/guide/claude-plugin) - Deep integration with Claude Code
