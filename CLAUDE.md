## Project Overview

Vibora is the Vibe Engineer's Cockpit. A terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

**Philosophy**:
- Terminal-first AI agent orchestration. Agents (Claude Code, Codex, etc.) run in terminals as-is—no abstraction layer, no wrapper APIs, no feature parity maintenance as agents evolve.
- Opinionated with few opinions. Provides structure without dictating workflow.
- Currently tasks create isolated git worktrees, but the architecture supports evolution toward more general task types (multi-repo, no-repo, etc.).
- Persistent terminals organized in tabs for work that doesn't fit neatly into task worktrees.
- Task terminals view shows all terminal sessions across all tasks and worktrees in a single parallel view.

## Development

All commands are mise tasks. Run `mise tasks` to list available commands.

```bash
mise run dev          # Start frontend and backend dev servers
mise run build        # Build for production
mise run up           # Build and start production server as daemon
mise run down         # Stop the daemon server
mise run check        # Run all checks (lint + typecheck)
mise run lint         # Run ESLint
mise run typecheck    # Check TypeScript types
mise run db:push      # Sync schema to database
mise run db:studio    # Open Drizzle Studio GUI
mise run cli:build    # Build CLI package for npm distribution
mise run bump         # Bump patch version (or: bump major, bump minor)
```

## CLI

The `@vibora/cli` package provides a global CLI for running vibora as a daemon:

```bash
vibora up             # Start the bundled server as daemon
vibora down           # Stop the daemon
vibora status         # Check if server is running
vibora tasks          # List/manage tasks
```

The CLI runs a pre-bundled version of vibora (frontend + server) and can be run from any directory.

### Building the CLI

```bash
mise run cli:build    # Bundle server, copy frontend, generate migrations
mise run cli:publish  # Publish to npm (runs cli:build first)
```

The built CLI package includes:
- `cli/server/index.js` - Bundled server
- `cli/dist/` - Pre-built frontend assets
- `cli/drizzle/` - SQL migrations
- `cli/lib/librust_pty.so` - Native PTY library

## Architecture

### Frontend (`src/`)
- **React 19** with TanStack Router (file-based routing in `src/routes/`)
- **TanStack React Query** for server state
- **shadcn/ui** (v4 with baseui support) for UI components
- **xterm.js** for terminal emulation
- Components organized by feature: `kanban/`, `terminal/`, `viewer/`, `ui/`
- Path alias: `@` → `./src/`

### Backend (`server/`)
- **Hono.js** framework on Bun runtime
- **SQLite** database with Drizzle ORM
- **WebSocket** for real-time terminal I/O (`@hono/node-ws`)
- **node-pty** for PTY management

### Key Data Flows
- REST API (`/api/*`) for task CRUD, git operations, config
- WebSocket (`/ws/terminal`) for terminal I/O multiplexing
- Frontend uses relative URLs - Vite proxies to backend in dev

## Database

- Default location: `~/.vibora/vibora.db` (SQLite with WAL mode)
- Schema: `server/db/schema.ts`

### Tables

- **tasks** - Task metadata, git worktree paths, status, Linear integration, PR tracking
- **repositories** - Saved git repositories with startupScript and copyFiles patterns
- **terminalTabs** - First-class tab entities for terminal organization
- **terminals** - Terminal instances with dtach session backing
- **terminalViewState** - Singleton UI state persistence (active tab, focused terminals)

Task statuses: `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELED`

## File Organization

```
src/
  routes/          # Pages (TanStack Router)
  components/      # React components by feature
  hooks/           # Custom hooks (use-tasks, use-terminal-ws, etc.)
server/
  routes/          # REST API handlers (/api/*)
  services/        # Business logic (pr-monitor, linear, task-status, notifications)
  terminal/        # PTY management (pty-manager, buffer-manager)
  websocket/       # WebSocket protocol for terminal I/O (/ws/terminal)
  db/              # Drizzle schema and initialization
  lib/             # Shared utilities (settings, etc.)
shared/            # Shared types (frontend, backend, CLI)
cli/
  src/             # CLI source (commands, utils)
  server/          # Bundled server (generated)
  dist/            # Frontend build (generated)
  drizzle/         # SQL migrations (generated)
```

## Configuration

Settings are stored in `.vibora/settings.json`. The vibora directory is resolved in this order:
1. `VIBORA_DIR` environment variable (explicit override)
2. `.vibora` in current working directory (per-worktree isolation)
3. `~/.vibora` (default)

### Settings

| Setting | Env Var | Default |
|---------|---------|---------|
| (base directory) | `VIBORA_DIR` | .vibora in CWD or ~/.vibora |
| port | `PORT` | 7777 |
| defaultGitReposDir | `VIBORA_GIT_REPOS_DIR` | ~ |
| linearApiKey | `LINEAR_API_KEY` | null |

Database path (`{viboraDir}/vibora.db`) and worktree path (`{viboraDir}/worktrees`) are derived from the vibora directory and not separately configurable.

Precedence: environment variable → settings.json → default

### Linear Integration

Vibora can sync task status with Linear tickets. Configure `linearApiKey` in settings or set the `LINEAR_API_KEY` environment variable.

```bash
# Link current task to a Linear ticket
vibora current-task linear https://linear.app/team/issue/TEAM-123
```

When a task status changes in Vibora, the linked Linear ticket status is updated automatically:
- `IN_PROGRESS` → "In Progress"
- `IN_REVIEW` → "In Review"
- `DONE` → "Done"
- `CANCELED` → "Canceled"

## Logging

Vibora uses a centralized JSON Lines (JSONL) logging system optimized for AI analysis and debugging.

### Log Format

Each log entry is a single JSON line:
```json
{"ts":"2024-12-24T15:30:00.123Z","lvl":"info","src":"PTYManager","msg":"Restored terminal","ctx":{"terminalId":"abc-123","name":"Terminal 1"}}
```

### Log Locations

| Platform | Location |
|----------|----------|
| Development | stdout (terminal) |
| Production daemon | `~/.vibora/server.log` (stdout) + `~/.vibora/vibora.log` |
| Desktop app | `~/.vibora/vibora.log` |

### Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed diagnostics (message payloads, state changes) |
| `info` | Normal operations (terminal created, server started) |
| `warn` | Recoverable issues (retry, fallback used) |
| `error` | Failures needing attention |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Backend minimum log level |
| `VITE_LOG_LEVEL` | `info` | Frontend minimum log level |
| `DEBUG` | `0` | Enable frontend debug logging (console + server) |

### Using the Logger

**Backend** (`server/lib/logger.ts`):
```typescript
import { log } from '../lib/logger'

log.pty.info('Restored terminal', { terminalId: id, name })
log.ws.error('Connection failed', { error: String(err) })
```

**Frontend** (`src/lib/logger.ts`):
```typescript
import { log } from '@/lib/logger'

log.taskTerminal.debug('cwd changed', { cwd })
log.ws.info('terminal:created', { terminalId, isNew: true })
```

### Searching Logs

```bash
# Find all errors
grep '"lvl":"error"' ~/.vibora/vibora.log

# Find logs for specific terminal
grep '"terminalId":"abc-123"' ~/.vibora/vibora.log

# Find PTYManager issues
grep '"src":"PTYManager"' ~/.vibora/vibora.log

# Pretty print with jq
cat ~/.vibora/vibora.log | jq 'select(.lvl == "error")'
```

### Debug Build

Build with debug logging enabled:
```bash
mise run desktop:package-dmg:debug  # DMG with debug logging
mise run build:debug                # Web build with debug logging
```

### Development vs Production

The `mise run dev` command requires explicit `PORT` and `VIBORA_DIR` environment variables to avoid accidentally running against production data:

```bash
# Development (explicitly set port and directory)
PORT=6666 VIBORA_DIR=~/.vibora/dev mise run dev

# Production (uses ~/.vibora with port 7777)
mise run start
```

## Terminal Architecture Notes

### dtach Session Lifecycle

Vibora uses `dtach` for persistent terminal sessions. Understanding the lifecycle is critical:

1. **Creation** (`dtach -n`): Creates socket and spawns shell, then **exits immediately**
2. **Attachment** (`dtach -a`): Connects to existing socket, this is the long-lived process

**Critical**: These are two separate processes. The creation process exits right away—don't hold references to it.

### Past Bug: Blank Screen Race Condition (Dec 2024)

**Symptom**: Task terminals showed blank screens in desktop app (the "blank screen of death"), worked fine in web.

**Root Cause**: Race condition in `TerminalSession` between `start()` and `attach()`:

```
Timeline:
  0ms   start() called - spawns dtach -n, sets this.pty
  5ms   dtach -n creates socket
 10ms   dtach -n exits (its job is done)
 16ms   attach() called - sees this.pty is set, returns early!
        → dtach -a never spawns → no data handlers → blank screen
```

The `start()` method was storing the short-lived `dtach -n` PTY in `this.pty`. When `attach()` checked `if (this.pty) return`, it bailed out thinking attachment already happened.

**Fix** (`server/terminal/terminal-session.ts`): Use a local `creationPty` variable in `start()` instead of `this.pty`. This ensures `attach()` always proceeds to spawn `dtach -a`.

**Lesson**: Never conflate the creation process with the attachment process. They have completely different lifecycles.
