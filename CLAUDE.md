# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibora is a task management application where each task corresponds to an isolated git worktree. It combines a React frontend with a Hono.js backend, featuring integrated terminal sessions via WebSocket.

**Core concept**: Task = Git Worktree. Creating a task automatically creates a git worktree for isolated development.

## Development Commands

```bash
# Start frontend dev server (port 5173, proxies API to backend)
bun run dev

# Start backend server (port 3222, with auto-reload)
bun run dev:server

# Build for production
bun run build

# Run production server
bun run start

# Lint
bun run lint

# Database operations
bun run db:push      # Sync schema to database
bun run db:studio    # Open Drizzle Studio GUI
bun run db:generate  # Generate migrations
bun run db:migrate   # Apply migrations
```

Run both `dev` and `dev:server` in separate terminals for development.

**Note**: The backend uses Bun runtime with `bun:sqlite` for the database.

## Architecture

### Frontend (`src/`)
- **React 19** with TanStack Router (file-based routing in `src/routes/`)
- **TanStack React Query** for server state
- **xterm.js** for terminal emulation
- Components organized by feature: `kanban/`, `terminal/`, `viewer/`, `ui/`
- Path alias: `@` → `./src/`

### Backend (`server/`)
- **Hono.js** framework with Node.js adapter
- **SQLite** database via better-sqlite3 + Drizzle ORM
- **WebSocket** for real-time terminal I/O (`@hono/node-ws`)
- **node-pty** for PTY management

### Key Data Flows
- REST API (`/api/*`) for task CRUD, git operations, config
- WebSocket (`/ws/terminal`) for terminal I/O multiplexing
- Frontend uses relative URLs - Vite proxies to backend in dev

## Database

- Location: `~/.vibora/vibora.db` (SQLite with WAL mode)
- Schema: `server/db/schema.ts`
- Single `tasks` table with fields for task metadata, git worktree paths, and status

Task statuses: `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELLED`

## API Routes

| Endpoint | Description |
|----------|-------------|
| `GET/POST /api/tasks` | List/create tasks |
| `GET/PATCH/DELETE /api/tasks/:id` | Task operations |
| `PATCH /api/tasks/:id/status` | Update status with position reordering |
| `DELETE /api/tasks/bulk` | Bulk delete |
| `GET /api/git/branches` | List repo branches |
| `POST/DELETE /api/git/worktree` | Worktree operations |
| `GET /api/git/diff` | Get git diff |
| `GET /api/fs/list` | Directory listing |
| `GET/PUT/DELETE /api/config/:key` | Settings |

## Terminal WebSocket Protocol

Connect to `/ws/terminal`. Messages use JSON with `type` and `payload`:

**Client → Server**: `terminal:create`, `terminal:input`, `terminal:resize`, `terminal:destroy`, `terminal:attach`, `terminal:rename`

**Server → Client**: `terminal:created`, `terminal:output`, `terminal:exit`, `terminal:attached`, `terminal:destroyed`, `terminal:error`

## File Organization

```
src/
  routes/          # Pages (TanStack Router)
  components/      # React components by feature
  hooks/           # Custom hooks (use-tasks, use-terminal-ws, etc.)
server/
  routes/          # Hono API route handlers
  terminal/        # PTY management (pty-manager, buffer-manager)
  websocket/       # WebSocket handlers
  db/              # Drizzle schema and initialization
```

## Configuration

Settings stored at `~/.vibora/settings.json`. Currently supports:
- `worktreeBasePath`: Base directory for git worktrees (default: `~/.vibora/worktrees`)
