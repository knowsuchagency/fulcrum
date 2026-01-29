# Project Fulcrum

**Your AI-Powered Digital Concierge. Orchestrate Agents. Never Miss What Matters.**

![Fulcrum Kanban Board with AI Assistant](https://raw.githubusercontent.com/knowsuchagency/fulcrum/main/screenshots/kanban-with-assistant-dark.png)

## What It Does

Fulcrum is your AI-powered command center for shipping software. Built for technical solopreneurs and CTOs who need to multiply their leverage—not just chase the latest coding trend.

Run Claude Code across multiple tasks in parallel. Stay connected to your agents via WhatsApp, Email, Discord, Telegram, or Slack. Let your AI assistant monitor messages, filter signal from noise, and send daily briefings—all while you focus on what matters.

Fulcrum doesn't replace your tools—it gives you leverage over them. You configure Claude Code with the integrations you need (Notion, Linear, Stripe, whatever). Fulcrum is your window into Claude Code and a literal fulcrum: a small input that moves mountains.

**Six pillars:**

- **Claude Code Ecosystem** — Deep integration with Claude Code. Connect via messaging channels, manage tasks, deploy from one dashboard.
- **Proactive AI Concierge** — Your assistant monitors messages, tracks actionable events, creates daily plans, and sends morning/evening briefings automatically.
- **Work From Anywhere** — Run Fulcrum on a remote server. Close your laptop, agents keep working.
- **Project Management** — Tasks with dependencies, due dates, labels, and attachments. Visual kanban boards.
- **Production Deployment** — Docker Compose with automatic Traefik routing and Cloudflare DNS/tunnels.
- **MCP-First Architecture** — 60+ tools exposed via Model Context Protocol. Agents discover what they need.

## MCP-First Architecture

Everything in Fulcrum is exposed through MCP (Model Context Protocol):

- **60+ MCP tools** for tasks, projects, apps, repos, notifications, and remote execution
- **Smart tool discovery** — `search_tools` lets agents find relevant tools without loading everything into context
- **Integrated assistant** — Built-in AI assistant with full context of your tasks, projects, and apps
- **External agent support** — Connect Claude Desktop, Clawdbot, or any MCP-compatible agent
- **No context bloat** — Agents discover and use only the tools they need

Whether you use Fulcrum's built-in assistant or an external agent like Claude Desktop, AI has seamless access to your entire workflow.

## Proactive Digital Concierge

Fulcrum's AI assistant doesn't just respond—it actively monitors and manages your workflow.

### Intelligent Message Handling

When messages arrive via Email, WhatsApp, Discord, Telegram, or Slack:

- **Actionable requests** (deadlines, meetings, tasks) → Tracked as events, optionally creates tasks
- **Casual conversations** → Responded to naturally, no tracking overhead
- **Spam/newsletters** → Silently ignored

### Actionable Events

Every important message becomes an **actionable event**—searchable, linkable to tasks, with a full decision audit trail. Your assistant remembers what it noticed and what it decided.

### Daily Planning

Your assistant creates and reviews daily plans automatically:

- **Evening** — Creates tomorrow's plan based on pending tasks and events, saves to your documents folder
- **Morning** — Reviews the plan, compares against current state, sends prioritized briefing

Plans persist as markdown files you can edit or review anytime.

### Scheduled Briefings

Configure morning and evening rituals in Settings:

- **Morning briefing** — Reviews yesterday's plan, prioritizes today's tasks and events
- **Evening recap** — What got done, what's blocked, creates tomorrow's plan

Briefings are sent to your preferred messaging channel automatically.

### Hourly Sweeps

Every hour, your assistant reviews pending events, checks on blocked or overdue tasks, and catches patterns across messages. Nothing slips through the cracks.

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
| **Email** | SMTP/IMAP credentials with sender allowlist |
| **WhatsApp** | QR code scan, monitors all messages, replies only to "Message yourself" |
| **Discord** | Bot token from Developer Portal |
| **Telegram** | Bot token from @BotFather |
| **Slack** | Bot + App tokens with Socket Mode |

- **Persistent sessions** — Conversation context maintained across messages
- **Email threading** — Each email thread is a separate conversation
- **Privacy-respecting** — WhatsApp sees all messages but only replies to you
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
| **Backup & Restore** | Snapshot database and settings; auto-safety-backup on restore |
| **Settings** | View and update configuration; manage notification channels |
| **Assistant Events** | Track actionable events; query decision history |

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
