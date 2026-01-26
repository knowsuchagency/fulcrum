# Project Fulcrum

**Harness Attention. Orchestrate Agents. Leverage Your Time Wisely.**

![Fulcrum Kanban Board with AI Assistant](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/kanban-with-assistant-dark.png)

## What It Does

Run multiple AI coding agents in parallel across isolated git worktrees. Manage projects with tasks, dependencies, and scheduling. Deploy to production when ready. Work from anywhere—your agents keep running when you close the laptop. Self-hosted and open source.

**Six pillars:**

- **Terminal-First Orchestration** — Run Claude Code, OpenCode, or other agents in real terminals. No abstraction layer, no wrapper APIs.
- **Work From Anywhere** — Run Fulcrum on a remote server. Kick off tasks, close your laptop, check progress from your phone. Agents keep working in the background.
- **Project Management** — Tasks with dependencies, due dates, labels, and attachments. Visual kanban boards and dependency graphs.
- **Production Deployment** — Docker Compose with automatic Traefik routing and Cloudflare DNS/tunnels.
- **MCP-First Architecture** — 60+ tools exposed via Model Context Protocol. Agents discover what they need.
- **Chat From Anywhere** — Talk to the AI assistant via WhatsApp, Discord, Telegram, or Slack.

## MCP-First Architecture

Everything in Fulcrum is exposed through MCP (Model Context Protocol):

- **60+ MCP tools** for tasks, projects, apps, repos, notifications, and remote execution
- **Smart tool discovery** — `search_tools` lets agents find relevant tools without loading everything into context
- **Integrated assistant** — Built-in AI assistant with full context of your tasks, projects, and apps
- **External agent support** — Connect Claude Desktop, Clawdbot, or any MCP-compatible agent
- **No context bloat** — Agents discover and use only the tools they need

Whether you use Fulcrum's built-in assistant or an external agent like Claude Desktop, AI has seamless access to your entire workflow.

## Quick Start

```bash
npx @knowsuchagency/fulcrum@latest up
```

Fulcrum will check for dependencies (bun, dtach, AI agent CLI), offer to install any that are missing, and start the server on http://localhost:7777.

### Desktop App

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [Download DMG](https://github.com/knowsuchagency/fulcrum/releases/latest/download/Fulcrum-macos-arm64.dmg) |
| **Linux** | [Download AppImage](https://github.com/knowsuchagency/fulcrum/releases/latest/download/Fulcrum-linux-x64.AppImage) |

The desktop app bundles everything—just install and run.

<details>
<summary>macOS Installation Notes</summary>

1. Open the DMG and drag Fulcrum to Applications
2. On first launch, macOS will block the app
3. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**
4. Confirm by clicking **Open Anyway** in the dialog

</details>

### Install Script (Remote Servers)

For remote servers or VPS, use the install script—it auto-installs all dependencies:

```bash
curl -fsSL https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/install.sh | bash
```

### Claude Code Plugin

Install the plugin for automatic status sync and task management:

```bash
claude plugin marketplace add knowsuchagency/fulcrum
claude plugin install fulcrum@fulcrum --scope user
```

## Features

### Kanban Board & AI Assistant

Track tasks from planning to done. The built-in AI assistant has full context of everything you're tracking—tasks, projects, apps—and can help with planning, documentation, or running MCP tools.

![Kanban Board with AI Assistant](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/kanban-with-assistant-dark.png)

### Parallel Agent Orchestration

Run multiple AI coding agents simultaneously across different tasks. Each task gets an isolated git worktree. Monitor and interact with all sessions from one screen.

![Parallel Agent Terminals](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/parallel-agent-terminals-dark.png)

### Projects

Unified view of repositories and deployments. Link repos, manage tasks, configure default agents, and see active work at a glance.

![Projects List](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/projects-list-dark.png)

### Project Workspace

Terminal with integrated file browser. Direct access to project files alongside your agent sessions.

![Project Workspace](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/project-workspace-dark.png)

### Task Dependencies

Define prerequisite tasks that must complete before others can start. Visualize with an interactive dependency graph.

![Task Dependency Graph](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/task-dependency-graph-dark.png)

### AI Assistant

Create documents with live preview. Generate charts and visualizations. The assistant uses the same MCP tools available to external agents.

![AI Assistant Editor](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/assistant-editor-dark.png)

### Messaging Integrations

Chat with the AI assistant from anywhere via your favorite messaging platform.

| Platform | Auth Method |
|----------|-------------|
| **WhatsApp** | QR code scan, uses "Message yourself" |
| **Discord** | Bot token from Developer Portal |
| **Telegram** | Bot token from @BotFather |
| **Slack** | Bot + App tokens with Socket Mode |

- **Persistent sessions** — Conversation context maintained across messages
- **Commands** — `/reset` (new conversation), `/help`, `/status`

Enable in Settings → Messaging and follow the setup instructions for each platform.

### System Monitoring

Track CPU, memory, and disk usage while your agents work. The Jobs tab manages systemd (Linux) or launchd (macOS) timers.

![System Monitoring](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/system-monitoring-dark.png)

## Supported Agents

| Agent | Description |
|-------|-------------|
| **Claude Code** | Anthropic's CLI coding agent with deep MCP integration |
| **OpenCode** | Open-source coding agent with GPT-4 and other model support |

Configure your default agent globally, per-repository, or per-task.

## Claude Code Plugin

The Fulcrum plugin enables seamless integration:

- **Automatic Status Sync** — Task moves to "In Review" when Claude stops, "In Progress" when you respond
- **Session Continuity** — Sessions tied to task IDs
- **MCP Server** — Task management tools available directly to Claude
- **Slash Commands** — `/review`, `/pr`, `/notify`, `/linear`, `/task-info`

```bash
claude plugin marketplace add knowsuchagency/fulcrum
claude plugin install fulcrum@fulcrum --scope user
```

## OpenCode Integration

```bash
fulcrum opencode install    # Install plugin + MCP server
fulcrum opencode uninstall  # Remove both
```

## MCP Tools

Both plugins include an MCP server with 60+ tools:

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

Run the backend on a remote server and connect from anywhere. Launch tasks, close your laptop, and your agents keep working.

### SSH Port Forwarding (Recommended)

```bash
# Forward local port 7777 to remote server's port 7777
ssh -L 7777:localhost:7777 your-server

# Or run in background with keep-alive
ssh -fN -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 7777:localhost:7777 your-server
```

On the remote server:
```bash
npx @knowsuchagency/fulcrum@latest up
```

The desktop app connects through the tunnel automatically. This is secure (no exposed ports), performant (direct SSH), and simple (no extra config).

### Browser Access

For browser-only access, use Tailscale or Cloudflare Tunnels to expose your server.

<details>
<summary><strong>Configuration</strong></summary>

Settings are stored in `.fulcrum/settings.json`. The fulcrum directory is resolved in this order:

1. `FULCRUM_DIR` environment variable
2. `.fulcrum` in current working directory
3. `~/.fulcrum` (default)

| Setting | Env Var | Default |
|---------|---------|---------|
| server.port | `PORT` | 7777 |
| paths.defaultGitReposDir | `FULCRUM_GIT_REPOS_DIR` | ~ |
| editor.sshPort | `FULCRUM_SSH_PORT` | 22 |
| integrations.linearApiKey | `LINEAR_API_KEY` | null |
| integrations.githubPat | `GITHUB_PAT` | null |
| appearance.language | — | null (auto-detect) |

Notification settings (sound, Slack, Discord, Pushover) are configured via Settings UI or CLI.

### Linear Integration

Sync task status with Linear tickets. Configure `linearApiKey` in settings or set `LINEAR_API_KEY`.

</details>

<details>
<summary><strong>CLI Reference</strong></summary>

### Server Management

```bash
fulcrum up                        # Start server daemon
fulcrum up -y                     # Start with auto-install
fulcrum down                      # Stop server
fulcrum status                    # Check server status
fulcrum doctor                    # Check all dependencies
fulcrum mcp                       # Start MCP server (stdio)
```

### Current Task (auto-detected from worktree)

```bash
fulcrum current-task info         # Get current task info
fulcrum current-task review       # Mark as IN_REVIEW
fulcrum current-task done         # Mark as DONE
fulcrum current-task cancel       # Mark as CANCELED
fulcrum current-task pr <url>     # Associate a PR
fulcrum current-task link <url>   # Add a reference link
```

### Agent Integration

```bash
fulcrum claude install            # Install Claude Code plugin + MCP server
fulcrum claude uninstall          # Remove plugin + MCP server
fulcrum opencode install          # Install OpenCode plugin + MCP server
fulcrum opencode uninstall        # Remove plugin + MCP server
```

### Notifications

```bash
fulcrum notifications             # Show notification settings
fulcrum notify <title> [message]  # Send a notification
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
