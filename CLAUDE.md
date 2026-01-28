## Project Overview

Fulcrum is the Vibe Engineer's Cockpit. A terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

**Philosophy**:
- Terminal-first AI agent orchestration. Agents (Claude Code, OpenCode, etc.) run in terminals as-is—no abstraction layer, no wrapper APIs.
- Currently tasks create isolated git worktrees, but the architecture supports evolution toward more general task types.
- Persistent terminals organized in tabs for work that doesn't fit neatly into task worktrees.
- App deployment via Docker Compose with automatic DNS/tunnel routing.
- System monitoring for Claude instances and resource usage.

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
```

For type checking, just run `mise run build` - it catches type errors and is faster than running separate typecheck commands.

## Testing

Run tests via mise to get filtered output that shows only failures:

```bash
mise run test         # Run all tests (quiet mode, errors only)
mise run test -- -v   # Run all tests with verbose output
mise run test:watch   # Run tests in watch mode
mise run test:file server/routes/config.test.ts  # Run specific test file
```

**Critical**: Never run `bun test` directly. Always use mise tasks for test isolation.

The mise test tasks set `HOME` and `FULCRUM_DIR` to temp directories **before** Bun starts. This is necessary because Bun caches `os.homedir()` at process startup, before any JavaScript runs. Without this isolation, tests that write to settings files would corrupt production `~/.fulcrum/settings.json` and `~/.claude/settings.json`.

## CLI

The `fulcrum` package provides a global CLI:

```bash
fulcrum up             # Start the bundled server as daemon
fulcrum down           # Stop the daemon
fulcrum status         # Check if server is running
fulcrum doctor         # Check all dependencies and versions
fulcrum mcp            # Run as MCP server (stdio transport)
fulcrum tasks          # List/manage tasks
fulcrum notifications  # Manage notification settings
fulcrum notify <title> <message>  # Send notification
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
- `channels/` - Chat with AI via external channels (WhatsApp, Discord, Telegram, Slack, Email)
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
- `/api/messaging/*` - Messaging channel management (WhatsApp, Discord, Telegram, Slack)
- `/ws/terminal` - Terminal I/O multiplexing

### Frontend Pages
- `/tasks`, `/tasks/$taskId` - Task management
- `/apps`, `/apps/new`, `/apps/$appId` - App deployment
- `/monitoring` - System metrics dashboard
- `/repositories`, `/repositories/$repoId` - Repository management
- `/terminals` - Persistent terminal tabs

## Database

- Default location: `~/.fulcrum/fulcrum.db` (SQLite with WAL mode)
- Schema: `server/db/schema.ts`

### Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Task metadata, git worktree paths, status, PR integration |
| `repositories` | Git repositories with startupScript, copyFiles, agent, agentOptions |
| `terminalTabs` | Tab entities for terminal organization |
| `terminals` | Terminal instances with tmux session backing |
| `terminalViewState` | Singleton UI state persistence |
| `apps` | Deployed Docker Compose applications |
| `appServices` | Services within apps (exposure, tunnel config) |
| `deployments` | Deployment history with logs |
| `tunnels` | Cloudflare Tunnels for app exposure |
| `systemMetrics` | CPU/memory/disk metrics (24h rolling) |
| `messagingConnections` | Messaging channel runtime state (connection status, display names) |
| `messagingSessionMappings` | Maps channel users to AI chat sessions |

Task statuses: `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`

### Migrations

Always use `mise run db:generate` to create migrations from schema changes. If you must write a migration manually:

1. **Use backticks** around table and column names
2. **Use `--> statement-breakpoint`** between multiple SQL statements
3. **Add entry to `drizzle/meta/_journal.json`** with incremented idx and unique timestamp

Example migration format:
```sql
ALTER TABLE `repositories` ADD `new_column` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `new_column` text;
```

**Never use standard SQL syntax** like `ADD COLUMN column_name TYPE` - Drizzle won't parse it correctly.

**Never use `db:push`** - It syncs schema directly without creating migration files. End users need migrations to upgrade their databases. Always use `db:generate` instead.

## Configuration

Settings stored in `~/.fulcrum/settings.json`. See `server/lib/settings/types.ts` for the full schema.

**Settings sections:**
- `server` - Port configuration
- `paths` - Default directories
- `editor` - Editor integration (VS Code, Cursor, Windsurf, Zed, Antigravity)
- `integrations` - Third-party APIs (GitHub, Cloudflare)
- `agent` - AI agent defaults (Claude Code, OpenCode)
- `tasks` - Task creation defaults
- `appearance` - UI theme and language
- `assistant` - Built-in assistant settings

**Separate config files:**
- `notifications.json` - Multi-channel notification settings
- `zai.json` - z.ai integration settings

Environment variables override settings.json values where applicable.

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

## Messaging

Chat with the AI assistant via external messaging platforms:

- **WhatsApp**: Link via QR code, chat with Claude through "Message yourself"
- **Discord**: Bot token auth, slash commands (`/reset`, `/help`, `/status`)
- **Telegram**: Bot token from @BotFather, handles private chats
- **Slack**: Socket Mode with bot + app tokens, Block Kit formatting, slash commands
- **Email**: SMTP/IMAP with sender allowlist filtering
- **Session persistence**: Conversations map to `chatSessions` table, one session per user

**Configuration storage:**
- **Credentials**: `settings.json` under `channels.*` (Slack, Discord, Telegram, Email)
- **WhatsApp**: Database (QR auth generates credentials dynamically)
- **Runtime state**: Database (connection status, bot display names)

Enable in Settings → Messaging and follow the setup instructions for each platform.

## Desktop App

Neutralinojs-based desktop application:

- Platforms: macOS (DMG), Linux (AppImage)
- Bundles compiled server executable (no Bun dependency)
- Auto-start capability

## Terminal Architecture

Fulcrum uses `dtach` for persistent terminal sessions:

1. **Creation** (`dtach -n`): Creates socket and spawns shell, then exits immediately
2. **Attachment** (`dtach -a`): Connects to existing socket, long-lived process

**Critical**: These are two separate processes. The creation process exits right away—don't hold references to it.

## Logging

JSONL format: `{"ts":"...","lvl":"info","src":"PTYManager","msg":"...","ctx":{...}}`

- Development: stdout
- Production: `~/.fulcrum/server.log` + `~/.fulcrum/fulcrum.log`

```bash
# Find errors
grep '"lvl":"error"' ~/.fulcrum/fulcrum.log | jq
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
    channels/      # External chat channels (WhatsApp, Discord, Telegram, Slack, Email)
  terminal/        # PTY management
  websocket/       # Terminal WebSocket protocol
  db/              # Drizzle schema
  lib/             # Utilities (settings, logger)
shared/            # Shared types
cli/               # CLI source and build output
desktop/           # Neutralino desktop app
```
