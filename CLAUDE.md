## Project Overview

Vibora is a lightweight PM cockpit for streamlining the software development lifecycle. It marries basic project management with actual software development by embedding terminals directly into the workflow.

**Philosophy**:
- Terminal-first AI agent orchestration. Agents (Claude Code, Codex, etc.) run in terminals as-is—no abstraction layer, no wrapper APIs, no feature parity maintenance as agents evolve.
- Opinionated with few opinions. Provides structure without dictating workflow.
- Currently tasks create isolated git worktrees, but the architecture supports evolution toward more general task types (multi-repo, no-repo, etc.).

## Development

All commands are mise tasks. Run `mise tasks` to list available commands.

```bash
mise run dev          # Start frontend and backend dev servers
mise run build        # Build for production
mise run check        # Run all checks (lint + typecheck)
mise run lint         # Run ESLint
mise run typecheck    # Check TypeScript types
mise run db:push      # Sync schema to database
mise run db:studio    # Open Drizzle Studio GUI
```

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
- Single `tasks` table with fields for task metadata, git worktree paths, and status

Task statuses: `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELLED`

## File Organization

```
src/
  routes/          # Pages (TanStack Router)
  components/      # React components by feature
  hooks/           # Custom hooks (use-tasks, use-terminal-ws, etc.)
server/
  routes/          # REST API handlers (/api/*)
  terminal/        # PTY management (pty-manager, buffer-manager)
  websocket/       # WebSocket protocol for terminal I/O (/ws/terminal)
  db/              # Drizzle schema and initialization
  lib/             # Shared utilities (settings, etc.)
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
| port | `PORT` | 3333 |
| databasePath | `VIBORA_DATABASE_PATH` | {viboraDir}/vibora.db |
| worktreeBasePath | `VIBORA_WORKTREE_PATH` | {viboraDir}/worktrees |
| defaultGitReposDir | `VIBORA_GIT_REPOS_DIR` | ~ |

Precedence: environment variable → settings.json → default

### Development vs Production

The `mise run dev` command defaults to `~/.vibora/dev` (port 3222) to keep development data separate from production:

```bash
# Development (uses ~/.vibora/dev with port 3222)
mise run dev

# Development with custom port
mise run dev 3333

# Development with custom directory
mise run dev 3333 ~/.vibora/custom

# Production (uses ~/.vibora with port 3333)
mise run start
```
