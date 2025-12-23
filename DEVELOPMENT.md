# Development

## Prerequisites

- [mise](https://mise.jdx.dev/) for task running and tool management
- [Bun](https://bun.sh/) (installed automatically via mise)

## Getting Started

```bash
# Install tools and dependencies
mise install

# Start both frontend and backend (recommended)
mise run dev

# Or run separately:
mise run server    # Backend (port 3333, with auto-reload)
mise run client    # Frontend (port 5173, proxies to backend)
```

Development mode defaults to `~/.vibora/dev` (port 3222) to keep development data separate from production.

## Available Tasks

```bash
mise run dev          # Start frontend and backend dev servers
mise run server       # Start backend dev server with auto-reload
mise run client       # Start frontend dev server
mise run build        # Build for production
mise run start        # Run production server
mise run up           # Build and start production server as daemon
mise run down         # Stop the daemon server
mise run check        # Run all checks (lint + typecheck)
mise run lint         # Run ESLint
mise run typecheck    # Check TypeScript types
mise run preview      # Preview production build

# Database operations
mise run db:push      # Sync schema to database
mise run db:studio    # Open Drizzle Studio GUI
mise run db:generate  # Generate migrations
mise run db:migrate   # Apply migrations

# CLI package
mise run cli:build    # Bundle server, copy frontend, generate migrations
mise run cli:publish  # Publish to npm (runs cli:build first)

# Version management
mise run bump         # Bump patch version (or: bump major, bump minor)
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
- **bun-pty** for PTY management

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

## CLI Package

The `@vibora/cli` package provides a global CLI for running Vibora as a daemon. The built CLI package includes:

- `cli/server/index.js` - Bundled server
- `cli/dist/` - Pre-built frontend assets
- `cli/drizzle/` - SQL migrations
- `cli/lib/librust_pty.so` - Native PTY library

### Building

```bash
mise run cli:build    # Bundle server, copy frontend, generate migrations
mise run cli:publish  # Publish to npm (runs cli:build first)
```
