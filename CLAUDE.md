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
mise run lint         # Run ESLint
mise run db:push      # Sync schema to database
mise run db:studio    # Open Drizzle Studio GUI
```

## Architecture

### Frontend (`src/`)
- **React 19** with TanStack Router (file-based routing in `src/routes/`)
- **TanStack React Query** for server state
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

Settings are stored in `.vibora/settings.json`. The server checks for a `.vibora` directory in the current working directory first, falling back to `~/.vibora`. This enables per-worktree isolation when developing Vibora within Vibora.

### Settings

| Setting | Env Var | Default |
|---------|---------|---------|
| port | `PORT` | 3333 |
| databasePath | `VIBORA_DATABASE_PATH` | {viboraDir}/vibora.db |
| worktreeBasePath | `VIBORA_WORKTREE_PATH` | ~/.vibora/worktrees |
| defaultGitReposDir | `VIBORA_GIT_REPOS_DIR` | ~ |

Precedence: environment variable → settings.json → default

### Per-Worktree Development

To run an isolated Vibora instance in a worktree:

```bash
# Create .env with a different port
echo "PORT=3223" > .env

# Create local .vibora directory for isolated database
mkdir -p .vibora

# Run dev servers (VITE_BACKEND_PORT is set automatically from PORT)
mise run dev
```
