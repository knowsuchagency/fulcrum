## Project Overview

Fulcrum is the Vibe Engineer's Cockpit. A terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

**Philosophy**:
- Terminal-first AI agent orchestration. Agents (Claude Code, OpenCode, etc.) run in terminals as-is—no abstraction layer, no wrapper APIs.
- Three task types: **Git** (isolated worktrees), **Scratch** (isolated directories, no git), **Manual** (no agent/directory).
- Persistent terminals organized in tabs for work that doesn't fit neatly into task worktrees.
- App deployment via Docker Compose with automatic DNS/tunnel routing.
- System monitoring for Claude instances and resource usage.

## Quick Navigation

| Topic | Section |
|-------|---------|
| Running dev server, building | [Development](#development) |
| Running tests | [Testing](#testing) |
| CLI commands | [CLI](#cli) |
| Tech stack, folder structure | [Architecture](#architecture) |
| Database schema, migrations | [Database](#database) |
| Settings, config files | [Configuration](#configuration) |
| Docker Compose apps | [App Deployment](#app-deployment) |
| Slack/Discord/Pushover | [Notifications](#notifications) |
| WhatsApp/Discord/Telegram/Slack/Email | [Messaging](#messaging) |
| Desktop app packaging | [Desktop App](#desktop-app) |
| dtach, PTY management | [Terminal Architecture](#terminal-architecture) |
| Log format, locations | [Logging](#logging) |
| Directory structure | [File Organization](#file-organization) |
| Agent coordination | [Agent Coordination Board](#agent-coordination-board) |

## Where to Find Things

**Adding a new feature:**
- Frontend page → `frontend/routes/` (file-based routing)
- API endpoint → `server/routes/` (Hono handlers)
- Business logic → `server/services/`
- Database table → `server/db/schema.ts`

**Modifying existing features:**
- Tasks/worktrees → `server/routes/tasks.ts`, `server/services/task-service.ts`, `server/services/task-status.ts` (status transitions, recurrence)
- Messaging channels → `server/services/channels/`, `server/routes/messaging.ts`
- App deployment → `server/routes/apps.ts`, `server/services/` (docker/cloudflare/traefik)
- Calendar integration → `server/services/caldav/`, `server/routes/caldav.ts`, `frontend/components/caldav/`
- Google integration → `server/services/google/`, `server/services/google-oauth.ts`, `server/routes/google.ts`, `server/routes/google-oauth.ts`
- Agent memory → `server/routes/memory.ts`, `server/services/memory-service.ts`, `server/routes/memory-file.ts`, `server/services/memory-file-service.ts`
- Unified search → `server/routes/search.ts`, `server/services/search-service.ts`
- Settings → `server/lib/settings/`, `frontend/routes/settings/`
- Secrets (fnox) → `server/lib/settings/fnox.ts`, `cli/src/utils/fnox-setup.ts`

**UI components:**
- Shared components → `frontend/components/ui/` (shadcn)
- Feature components → `frontend/components/{feature}/`

**Testing:**
- Test files live next to source: `*.test.ts`

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
fulcrum board              # Agent coordination board (read/post/check/clean)
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
- `caldav/` - Multi-account CalDAV calendar sync with event copy rules (Google Calendar OAuth2, generic CalDAV)
- `channels/` - Chat with AI via external channels (WhatsApp, Discord, Telegram, Slack, Email)
- `google/` - Google API integration (Calendar sync via googleapis, Gmail draft management, email sending)
- `google-oauth.ts` - Shared Google OAuth2 client management, token refresh
- `opencode-channel-service.ts` - OpenCode observer for channel message processing (structured JSON output, no direct tool access)
- `observer-tracking.ts` - Observer invocation tracking with circuit breaker, aggregate stats, and action records
- `search-service.ts` - Unified FTS5 full-text search across tasks, projects, messages, events, memories, and conversations
- `memory-service.ts` - Persistent agent memory with SQLite FTS5 full-text search
- `memory-file-service.ts` - Master memory file (MEMORY.md) read/write/section-update, injected into every system prompt
- `notification-service.ts` - Multi-channel notifications (Slack, Discord, Pushover, WhatsApp, Telegram, Gmail, desktop, sound)
- `pr-monitor.ts` - GitHub PR status polling, auto-close tasks on merge
- `metrics-collector.ts` - System metrics collection (CPU, memory, disk)
- `git-watcher.ts` - Auto-deploy on git changes
- `docker-swarm.ts` - Docker Swarm orchestration
- `cloudflare.ts` - DNS records, tunnels, certificates
- `compose-parser.ts` - Docker Compose parsing
- `traefik.ts` - Reverse proxy management

### Key Routes (`server/routes/`)
- `/api/tasks/*` - Task CRUD
- `/api/scratch-dirs` - Scratch directory listing and management
- `/api/apps/*` - App deployment management
- `/api/monitoring/*` - System and Claude instance monitoring, channel messages, observer invocations
- `/api/config/fnox-status` - fnox availability and secret count
- `/api/deployments/*` - Deployment history
- `/api/repositories/*` - Repository management (creation auto-creates or links to a project)
- `/api/jobs/*` - Systemd/launchd timer management (list, CRUD, enable/disable, run, logs)
- `/api/search` - Unified full-text search across all entity types (incl. conversations)
- `/api/memory/*` - Agent memory CRUD and FTS5 search
- `/api/memory-file` - Master memory file read/write/section-update
- `/api/messaging/*` - Messaging channel management (WhatsApp, Discord, Telegram, Slack)
- `/api/assistant/*` - Unified assistant API (Claude and OpenCode providers)
- `/api/caldav/*` - CalDAV calendar integration (accounts, sync, OAuth, copy rules)
- `/api/google/*` - Google account CRUD, calendar/Gmail enable/disable, Gmail drafts
- `/api/google/oauth/*` - Google OAuth2 authorization flow and callback
- `/mcp` - MCP HTTP transport (full tool access)
- `/mcp/observer` - MCP HTTP transport (restricted tools for observer processing)
- `/ws/terminal` - Terminal I/O multiplexing

### Frontend Pages
- `/tasks`, `/tasks/$taskId` - Task management
- `/calendar` - Calendar view with month/week views, project/tag filters (Cmd+7)
- `/jobs` - Systemd/launchd timer management (Cmd+6)
- `/apps` - App deployment overview (card grid linking to repository deploy tabs)
- `/monitoring` - System metrics dashboard (includes Review tab, Observer tab)
- `/repositories`, `/repositories/$repoId` - Repository management
- `/terminals` - Persistent terminal tabs

## Database

- Default location: `~/.fulcrum/fulcrum.db` (SQLite with WAL mode)
- Schema: `server/db/schema.ts`

### Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Task metadata, git worktree paths, status, PR integration, type (worktree/scratch/null=manual), time estimate (hours), priority (high/medium/low), recurrence (rule, end date, source task) |
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
| `channelMessages` | Unified storage for all channel messages (WhatsApp, Discord, Telegram, Slack, Email) |
| `googleAccounts` | Unified Google API accounts (Calendar + Gmail) with OAuth2 tokens, scopes, and reauth detection |
| `gmailDrafts` | Cached Gmail draft metadata (recipients, subject, body) |
| `caldavAccounts` | CalDAV account credentials and sync state (supports multiple accounts) |
| `caldavCalendars` | Synced CalDAV calendars with account association |
| `caldavEvents` | Calendar events (summary, start/end, location, all-day flag) |
| `caldavCopyRules` | One-way event copy rules between calendars across accounts |
| `caldavCopiedEvents` | Tracks copied events to avoid duplicates and detect changes |
| `memories` | Persistent agent knowledge store with FTS5 full-text search |
| `observerInvocations` | Observer message processing tracking (channel, sender, status, actions taken, circuit breaker) |

Task statuses: `TO_DO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`

Recurrence rules: `daily`, `weekly`, `biweekly`, `monthly`, `quarterly`, `yearly` (null = no recurrence). When a repeating task is marked DONE, a new TO_DO task is automatically created with the next due date. CANCELED tasks don't spawn new ones. Logic lives in `server/services/task-status.ts`.

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

All configuration stored in `~/.fulcrum/.fnox.toml` using fnox. See `server/lib/settings/types.ts` for the schema and `server/lib/settings/fnox.ts` for the fnox config map.

**Configuration architecture:**
- `.fnox.toml` is the single source of truth for ALL configuration (~80 settings)
- Non-sensitive values use `plain` provider (readable without decryption)
- Sensitive values (API keys, tokens, webhook URLs) use `age` provider (encrypted)
- In-memory cache for fast access (loaded via `fnox export` at startup)
- Settings precedence: env var > fnox > default
- No more `settings.json`, `notifications.json`, or `zai.json` files

**Settings sections:**
- `server` - Port configuration
- `paths` - Default directories
- `editor` - Editor integration (VS Code, Cursor, Windsurf, Zed, Antigravity)
- `integrations` - Third-party APIs (GitHub, Cloudflare, Google OAuth client ID/secret)
- `agent` - AI agent defaults (Claude Code, OpenCode)
- `tasks` - Task creation defaults
- `appearance` - UI theme and language
- `assistant` - Built-in assistant settings (model, provider, observerModel/observerProvider for cost-effective observe-only processing)
- `caldav` - CalDAV calendar integration (global enable/sync interval; account credentials stored in DB)
- `notifications` - Multi-channel notification settings (toast, desktop, sound, Slack, Discord, Pushover, WhatsApp, Telegram, Gmail)
- `zai` - z.ai integration settings

**Config files:**
- `.fnox.toml` - All configuration (plain + encrypted values)
- `age.txt` - Age private key for fnox encryption (generated once on first `fulcrum up`, never committed)

**Migration:**
- Existing `settings.json`, `notifications.json`, and `zai.json` are automatically migrated to fnox on server start
- After migration, old files are renamed to `.migrated` (e.g., `settings.json.migrated`)
- `fulcrum up` ensures fnox + age are installed and configured before starting the server
- Implementation: `server/lib/settings/fnox.ts` (config map, CLI wrapper, cache), `server/lib/settings/migrate-to-fnox.ts` (migration logic)

**Backup/restore:**
- Backups now include `.fnox.toml` + `age.txt` (no more settings.json)
- Restoring a backup restores the entire fnox configuration

Environment variables override fnox values where applicable.

## App Deployment

Deploy Docker Compose applications with automatic routing:

- **DNS mode**: Traefik reverse proxy with Cloudflare DNS records
- **Tunnel mode**: Cloudflare Tunnels for NAT traversal
- Auto-deploy on git push via git-watcher
- Build logs and deployment history tracked

## Notifications

Multi-channel notification system:

- **Channels**: Toast, desktop, sound, Slack, Discord, Pushover, WhatsApp, Telegram, Gmail
- **Slack/Discord**: Can send via webhook URL or via connected messaging channel (`useMessagingChannel`)
- **WhatsApp/Telegram**: Require connected messaging channel
- **Gmail**: Sends notification emails to user's own Gmail address via Gmail API
- **Events**: Task completion, PR merge, deployment success/failure

## Messaging

Chat with the AI assistant via external messaging platforms:

- **WhatsApp**: Link via QR code, chat with Claude through "Message yourself"
- **Discord**: Bot token auth, slash commands (`/reset`, `/help`, `/status`)
- **Telegram**: Bot token from @BotFather, handles private chats
- **Slack**: Socket Mode with bot + app tokens, Block Kit formatting, slash commands
- **Email**: Gmail API or IMAP/SMTP backends, collects all non-automated emails (observe-only, no auto-responses)
- **Gmail**: Send emails via Gmail API (OAuth2), always sends to user's own address
- **Session persistence**: Conversations map to `chatSessions` table, one session per user
- **User-only messaging**: Outbound messages are restricted to the user's own accounts (no third-party messaging)
- **Auto-resolve recipients**: `to` parameter is optional; auto-resolves from channel state

**Configuration storage:**
- **Credentials**: `settings.json` under `channels.*` (Slack, Discord, Telegram, Email)
- **WhatsApp**: Database (QR auth generates credentials dynamically)
- **Runtime state**: Database (connection status, bot display names)

Enable in Settings → Email & Messaging and follow the setup instructions for each platform.

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

## Agent Coordination Board

Filesystem-based message board for coordinating multiple AI agents running in separate worktrees. No server dependency — works when the Fulcrum server is down.

- **Directory**: `~/.fulcrum/board/messages/` (one JSON file per message)
- **CLI**: `fulcrum board` command group (read, post, check, release-all, clean)
- **MCP tools**: `board_read`, `board_post`, `board_check` (always loaded, not deferred)
- **Core library**: `cli/src/board/` (types, filesystem operations)

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
    google/        # Google API services (Calendar, Gmail)
  terminal/        # PTY management
  websocket/       # Terminal WebSocket protocol
  db/              # Drizzle schema
  lib/             # Utilities (settings, logger)
shared/            # Shared types
cli/               # CLI source and build output
desktop/           # Neutralino desktop app
```
