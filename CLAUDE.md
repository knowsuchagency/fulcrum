## Project Overview

Vibora is the Vibe Engineer's Cockpit. A terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

**Philosophy**:
- Terminal-first AI agent orchestration. Agents (Claude Code, Codex, etc.) run in terminals as-is—no abstraction layer, no wrapper APIs.
- Currently tasks create isolated git worktrees, but the architecture supports evolution toward more general task types.
- Persistent terminals organized in tabs for work that doesn't fit neatly into task worktrees.
- App deployment via Docker Compose with automatic DNS/tunnel routing.
- System monitoring for Claude instances and resource usage.

**Documentation**: See `docs/` for comprehensive user documentation.

## Development

All commands are mise tasks. Run `mise tasks` to list available commands.

```bash
mise run dev          # Start frontend and backend dev servers
mise run build        # Build for production
mise run up           # Build and start production server as daemon
mise run down         # Stop the daemon server
mise run check        # Run all checks (lint + typecheck + version)
mise run db:generate  # Generate new migration from schema changes
mise run db:migrate   # Apply pending migrations
mise run db:studio    # Open Drizzle Studio GUI
mise run cli:build    # Build CLI package for npm distribution
mise run bump         # Bump patch version (or: bump major, bump minor)
mise run desktop:package  # Package desktop app for current platform
mise run docs:dev     # Start documentation dev server
```

## CLI

The `vibora` package provides a global CLI:

```bash
vibora up             # Start the bundled server as daemon
vibora down           # Stop the daemon
vibora status         # Check if server is running
vibora doctor         # Check all dependencies and versions
vibora mcp            # Run as MCP server (stdio transport)
vibora tasks          # List/manage tasks
vibora notifications  # Manage notification settings
vibora notify <title> <message>  # Send notification
```

## Architecture

### Frontend (`frontend/`)
- **React 19** with TanStack Router (file-based routing in `frontend/routes/`)
- **TanStack React Query** for server state
- **shadcn/ui** (v4) for UI components
- **xterm.js** for terminal emulation
- Path alias: `@` → `./frontend/`

### Backend (`server/`)
- **Hono.js** framework on Bun runtime
- **SQLite** database with Drizzle ORM
- **WebSocket** for real-time terminal I/O
- **bun-pty** for PTY management

### Key Services (`server/services/`)
- `notification-service.ts` - Multi-channel notifications (Slack, Discord, Pushover, desktop, sound)
- `pr-monitor.ts` - GitHub PR status polling, auto-close tasks on merge
- `metrics-collector.ts` - System metrics collection (CPU, memory, disk)
- `git-watcher.ts` - Auto-deploy on git changes
- `docker-swarm.ts` - Docker Swarm orchestration
- `cloudflare.ts` - DNS records, tunnels, certificates
- `compose-parser.ts` - Docker Compose parsing
- `traefik.ts` - Reverse proxy management

### Key Routes (`server/routes/`)
- `/api/tasks/*` - Task CRUD
- `/api/apps/*` - App deployment management
- `/api/monitoring/*` - System and Claude instance monitoring
- `/api/deployments/*` - Deployment history
- `/api/repositories/*` - Repository management
- `/ws/terminal` - Terminal I/O multiplexing

### Frontend Pages
- `/tasks`, `/tasks/$taskId` - Task management
- `/apps`, `/apps/new`, `/apps/$appId` - App deployment
- `/monitoring` - System metrics dashboard
- `/repositories`, `/repositories/$repoId` - Repository management
- `/terminals` - Persistent terminal tabs

## Database

- Default location: `~/.vibora/vibora.db` (SQLite with WAL mode)
- Schema: `server/db/schema.ts`

### Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Task metadata, git worktree paths, status, Linear/PR integration |
| `repositories` | Git repositories with startupScript, copyFiles, agent, agentOptions |
| `terminalTabs` | Tab entities for terminal organization |
| `terminals` | Terminal instances with tmux session backing |
| `terminalViewState` | Singleton UI state persistence |
| `apps` | Deployed Docker Compose applications |
| `appServices` | Services within apps (exposure, tunnel config) |
| `deployments` | Deployment history with logs |
| `tunnels` | Cloudflare Tunnels for app exposure |
| `systemMetrics` | CPU/memory/disk metrics (24h rolling) |

Task statuses: `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`

## Configuration

Settings stored in `.vibora/settings.json` with nested structure (schema v7):

```json
{
  "server": { "port": 7777 },
  "paths": { "defaultGitReposDir": "~" },
  "editor": { "app": "vscode", "host": "", "sshPort": 22 },
  "integrations": {
    "linearApiKey": null,
    "githubPat": null,
    "cloudflareApiToken": null,
    "cloudflareAccountId": null
  },
  "appearance": { "language": null, "theme": null, "syncClaudeCodeTheme": false },
  "notifications": {
    "enabled": true,
    "toast": { "enabled": true },
    "desktop": { "enabled": true },
    "sound": { "enabled": true },
    "slack": { "enabled": false, "webhookUrl": "" },
    "discord": { "enabled": false, "webhookUrl": "" },
    "pushover": { "enabled": false, "appToken": "", "userKey": "" }
  },
  "zai": { "enabled": false, "apiKey": null }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VIBORA_DIR` | Override vibora directory (default: ~/.vibora) |
| `PORT` | Server port (default: 7777) |
| `VIBORA_GIT_REPOS_DIR` | Default git repos directory |
| `VIBORA_SSH_PORT` | SSH port for editor integration |
| `LINEAR_API_KEY` | Linear API key |
| `GITHUB_PAT` | GitHub Personal Access Token |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `LOG_LEVEL` | Backend log level (debug, info, warn, error) |

Precedence: environment variable → settings.json → default

## App Deployment

Deploy Docker Compose applications with automatic routing:

- **DNS mode**: Traefik reverse proxy with Cloudflare DNS records
- **Tunnel mode**: Cloudflare Tunnels for NAT traversal
- Auto-deploy on git push via git-watcher
- Build logs and deployment history tracked

## Notifications

Multi-channel notification system:

- **Channels**: Toast, desktop, sound, Slack, Discord, Pushover
- **Events**: Task completion, PR merge, deployment success/failure

## Desktop App

Neutralinojs-based desktop application:

- Platforms: macOS (DMG), Linux (AppImage)
- Bundles compiled server executable (no Bun dependency)
- Auto-start capability

## Terminal Architecture

Vibora uses `dtach` for persistent terminal sessions:

1. **Creation** (`dtach -n`): Creates socket and spawns shell, then exits immediately
2. **Attachment** (`dtach -a`): Connects to existing socket, long-lived process

**Critical**: These are two separate processes. The creation process exits right away—don't hold references to it.

## Logging

JSONL format: `{"ts":"...","lvl":"info","src":"PTYManager","msg":"...","ctx":{...}}`

- Development: stdout
- Production: `~/.vibora/server.log` + `~/.vibora/vibora.log`

```bash
# Find errors
grep '"lvl":"error"' ~/.vibora/vibora.log | jq
```

## File Organization

```
frontend/
  routes/          # Pages (TanStack Router)
  components/      # React components by feature
  hooks/           # Custom hooks
server/
  routes/          # REST API handlers
  services/        # Business logic
  terminal/        # PTY management
  websocket/       # Terminal WebSocket protocol
  db/              # Drizzle schema
  lib/             # Utilities (settings, logger)
shared/            # Shared types
cli/               # CLI source and build output
desktop/           # Neutralino desktop app
docs/              # VitePress documentation
```
