# Project Fulcrum

**Harness Attention. Orchestrate Agents. Leverage Your Time Wisely.**

![Fulcrum Kanban Board](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/tasks-kanban-board.png)

## What It Does

Run multiple AI coding agent sessions in parallel across isolated git worktrees. Monitor them all from one screen. Close your laptop—they keep working. Deploy to production when ready. Self-hosted and open source.

Fulcrum supports **Claude Code** and **OpenCode** with per-repository and per-task agent selection.

- **Full Development Lifecycle** — Develop features in isolated git worktrees, then deploy to production with Docker Compose. No context switching, no vendor lock-in.
- **Parallel Agent Orchestration** — Run multiple AI agent sessions across different tasks and worktrees. See and control all sessions in one parallel view.
- **Work From Anywhere** — Close your laptop—your agents keep working on your behalf. Pick up where you left off from your phone.
- **Multi-Agent Support** — Choose between Claude Code and OpenCode. Set a global default, override per-repository, or select per-task.
- **Open Source & Self-Hosted** — Inspect the code, run it anywhere, own your data. From a $5 VPS to your home lab.

## Key Features

- **Projects** — Unified view combining repositories and app deployments with workspace terminals
- **App Deployment** — Deploy with Docker Compose, automatic Traefik routing, optional Cloudflare DNS integration
- **Parallel Agent Orchestration** — Run multiple AI coding agent sessions across different tasks and worktrees
- **Multi-Agent Support** — Use Claude Code or OpenCode, configurable globally, per-repo, or per-task
- **Work From Anywhere** — Run on a remote server; agents continue working when you disconnect
- **Git Worktree Isolation** — Safe experimentation without touching your main branch
- **Claude Code Plugin** — Skill for task management, automatic status sync, session continuity
- **MCP Server** — 60+ tools for tasks, projects, apps, and remote execution
- **Kanban Task Management** — Visual task tracking from planning to done
- **Task Dependencies** — Define prerequisite tasks; visualize with dependency graph
- **Task & Project Context** — Attach files, add reference links, set due dates, organize with labels
- **PR Monitoring** — Track pull requests across repositories
- **Linear Integration** — Sync task status with Linear tickets
- **Job Scheduling** — Create and manage systemd/launchd timers from the UI
- **Cross-Platform** — Desktop app (Mac, Linux) or web application

## Quick Start

```bash
npx @knowsuchagency/fulcrum@latest up
```

That's it! Fulcrum will:
- Check for required dependencies (bun, dtach, AI agent CLI, uv)
- Offer to install any that are missing
- Start the server on http://localhost:7777
- Show getting started tips

Open http://localhost:7777 in your browser.

### Check Your Setup

```bash
fulcrum doctor
```

Shows the status of all dependencies with versions.

### Desktop App

Download the desktop app for a bundled experience:

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [Download DMG](https://github.com/knowsuchagency/fulcrum/releases/latest/download/Fulcrum-macos-arm64.dmg) |
| **Linux** | [Download AppImage](https://github.com/knowsuchagency/fulcrum/releases/latest/download/Fulcrum-linux-x64.AppImage) |

The desktop app bundles everything—just install and run. It will start the server, install the Claude Code plugin, and check for updates automatically.

<details>
<summary>macOS Installation Notes</summary>

1. Open the DMG and drag Fulcrum to Applications
2. On first launch, macOS will block the app
3. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**
4. Confirm by clicking **Open Anyway** in the dialog

</details>

### Install Script (Recommended for Remote Servers)

For remote servers or VPS, use the install script—it auto-installs all dependencies:

```bash
curl -fsSL https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/install.sh | bash
```

This installs bun, dtach, uv, Claude Code, OpenCode, GitHub CLI, Docker, cloudflared, and the fulcrum CLI + Claude Code plugin.

### Claude Code Plugin

Install the plugin for automatic status sync and task management:

```bash
claude plugin marketplace add knowsuchagency/fulcrum
claude plugin install fulcrum@fulcrum --scope user
```

## Features

### Kanban Board

Track tasks from planning to done. Create tasks that automatically spin up isolated git worktrees, and watch their status update in real-time as you work with your AI agents.

![Kanban Board](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/tasks-kanban-board.png)

### Task Terminals View

See all your AI agent sessions across every task in a single parallel view. Each task creates an isolated git worktree on-demand, and you can monitor and interact with all sessions simultaneously.

![Task Terminals View](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/terminals-view-with-tests.png)

### App Deployment

Deploy applications directly from Fulcrum with Docker Compose. Edit compose files inline, configure environment variables, and manage services with automatic Traefik routing and optional Cloudflare DNS integration.

![App Deployment](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/app-deployment-config.png)

### Projects

Projects unify your code repositories and app deployments into a single entity. Manage workspace terminals, task settings, and deployment configuration from one place.

![Projects](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/repositories-view.png)

### Browser Preview

Preview your app alongside the agent terminal in a split-pane view. Watch changes in real-time as your AI agent iterates on your code.

![Browser Preview](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/browser-preview-split-view.png)

### System Monitoring

Keep an eye on system resources while your agents work. CPU, memory, and disk usage at a glance. The Jobs tab lets you create and manage systemd (Linux) or launchd (macOS) timers.

![System Monitoring](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/monitoring-system-metrics.png)

## Supported Agents

Fulcrum supports multiple AI coding agents:

| Agent | Description |
|-------|-------------|
| **Claude Code** | Anthropic's CLI coding agent with deep MCP integration |
| **OpenCode** | Open-source coding agent with GPT-4 and other model support |

Configure your default agent globally in settings, override per-repository, or select per-task when creating new tasks.

## Claude Code Plugin

The Fulcrum plugin for Claude Code enables seamless integration:

- **Automatic Status Sync** — Task moves to "In Review" when Claude stops, "In Progress" when you respond
- **Session Continuity** — Claude sessions are tied to task IDs
- **MCP Server** — Task management tools available directly to Claude
- **Fulcrum Skill** — CLI documentation for task management (see `plugins/fulcrum/skills/`)
- **Slash Commands** — `/review`, `/pr`, `/notify`, `/linear`, `/task-info`

The plugin is automatically installed when Fulcrum starts. To install manually:

```bash
claude plugin marketplace add knowsuchagency/fulcrum
claude plugin install fulcrum@fulcrum --scope user
```

## OpenCode Integration

The Fulcrum plugin for OpenCode enables seamless integration:

- **Automatic Status Sync** — Task moves to "In Review" when OpenCode stops, "In Progress" when you respond
- **Session Continuity** — OpenCode sessions are tied to task IDs
- **MCP Server** — Task management tools available directly to OpenCode

```bash
fulcrum opencode install    # Install plugin + MCP server
fulcrum opencode uninstall  # Remove both
```

## MCP Tools

Both Claude Code and OpenCode plugins include an MCP server with 60+ tools for task management, project organization, app deployment, and remote execution:

| Category | Description |
|----------|-------------|
| **Tasks** | Create, update, move tasks; manage links, labels, attachments, due dates |
| **Task Dependencies** | Define prerequisite tasks; visualize with dependency graph |
| **Projects** | Manage projects with tags, notes, and file attachments |
| **Repositories** | Add, configure, and link repositories to projects |
| **Apps** | Deploy, stop, and monitor Docker Compose applications |
| **Filesystem** | Browse directories, read/write files on the Fulcrum server |
| **Execution** | Run shell commands with persistent session support |
| **Notifications** | Send notifications to enabled channels |

Use `search_tools` to discover available tools by keyword or category.

For Claude Desktop, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fulcrum": {
      "command": "fulcrum",
      "args": ["mcp"]
    }
  }
}
```

## Remote Server Setup

Run the backend on a remote server and connect from anywhere. Launch tasks, close your laptop, and your agents keep working. As AI becomes more capable of autonomous work, this becomes essential.

### Desktop App: SSH Port Forwarding (Recommended)

The desktop app connects to `localhost:7777`. Use SSH port forwarding to tunnel to your remote server:

```bash
# Forward local port 7777 to remote server's port 7777
ssh -L 7777:localhost:7777 your-server

# Or run in background with keep-alive
ssh -fN -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 7777:localhost:7777 your-server
```

On the remote server, start Fulcrum:
```bash
npx @knowsuchagency/fulcrum@latest up
```

The desktop app will connect through the tunnel automatically. This approach is:
- **Secure** — Backend stays bound to localhost, no exposed ports
- **Performant** — Direct SSH connection, lower latency than overlay networks
- **Simple** — No additional configuration needed

For persistent tunnels on macOS, use a launchd agent. See [this guide](https://gist.github.com/knowsuchagency/60656087903cd56d3a9b5d1d5c803186).

### Browser: Tailscale or Cloudflare Tunnels

For browser-only access, you can use Tailscale or Cloudflare Tunnels to expose your server:

1. **On the remote server:**
   ```bash
   npx @knowsuchagency/fulcrum@latest up
   ```

2. **Access via browser** — Open the tunnel URL (e.g., `http://your-server.tailnet.ts.net:7777`)

<details>
<summary><strong>Configuration</strong></summary>

Settings are stored in `.fulcrum/settings.json`. The fulcrum directory is resolved in this order:

1. `FULCRUM_DIR` environment variable (explicit override)
2. `.fulcrum` in current working directory (per-worktree isolation)
3. `~/.fulcrum` (default)

| Setting | Env Var | Default |
|---------|---------|---------|
| server.port | `PORT` | 7777 |
| paths.defaultGitReposDir | `FULCRUM_GIT_REPOS_DIR` | ~ |
| editor.sshPort | `FULCRUM_SSH_PORT` | 22 |
| integrations.linearApiKey | `LINEAR_API_KEY` | null |
| integrations.githubPat | `GITHUB_PAT` | null |
| appearance.language | — | null (auto-detect) |

Notification settings (sound, Slack, Discord, Pushover) are configured via the Settings UI or CLI.

Precedence: environment variable → settings.json → default

### Linear Integration

Fulcrum can sync task status with Linear tickets. Configure `linearApiKey` in settings or set `LINEAR_API_KEY`. When a task is linked to a Linear ticket, status changes in Fulcrum automatically update Linear.

</details>

<details>
<summary><strong>CLI Reference</strong></summary>

The CLI lets AI agents working inside task worktrees query and update task status.

### Server Management

```bash
fulcrum up                        # Start server daemon
fulcrum up -y                     # Start with auto-install (no prompts)
fulcrum down                      # Stop server
fulcrum status                    # Check server status
fulcrum doctor                    # Check all dependencies
fulcrum mcp                       # Start MCP server (stdio)
```

### Current Task (auto-detected from worktree)

```bash
fulcrum current-task info         # Get current task info (default)
fulcrum current-task review       # Mark as IN_REVIEW
fulcrum current-task done         # Mark as DONE
fulcrum current-task cancel       # Mark as CANCELED
fulcrum current-task pr <url>     # Associate a PR with current task
fulcrum current-task link <url>   # Add a reference link to the task
fulcrum current-task link         # List all links
fulcrum current-task link -r <id> # Remove a link
```

### Agent Integration

```bash
fulcrum claude install            # Install Claude Code plugin + MCP server
fulcrum claude uninstall          # Remove plugin + MCP server
fulcrum opencode install          # Install OpenCode plugin + MCP server
fulcrum opencode uninstall        # Remove plugin + MCP server
```

### Configuration

```bash
fulcrum config get <key>          # Get a config value
fulcrum config set <key> <value>  # Set a config value
```

### Notifications

```bash
fulcrum notifications             # Show notification settings
fulcrum notifications enable      # Enable notifications
fulcrum notifications disable     # Disable notifications
fulcrum notifications test <ch>   # Test a channel
fulcrum notify <title> [message]  # Send a notification
```

### Global Options

```bash
--port=<port>     # Server port (default: 7777)
--url=<url>       # Override full server URL
--pretty          # Pretty-print JSON output
```

</details>

## Internationalization

Available in English and Chinese. Set the `language` setting or let it auto-detect from your browser.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup, architecture, and contributing guidelines.

## License

[PolyForm Perimeter 1.0.0](LICENSE)

**In plain English:**

- ✅ Use Fulcrum for any purpose—personal or commercial
- ✅ Build and sell software using Fulcrum (we have no claim over your work)
- ❌ Resell or redistribute Fulcrum itself for profit
- ⚠️ The software is provided as-is
