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
mise run server    # Backend (uses PORT env var, with auto-reload)
mise run client    # Frontend (port 5173, proxies to backend)
```

Development mode defaults to `~/.vibora/dev` (port 8888) to keep development data separate from production.

> **Note**: Port 6666 might conflict with the 'cbt' (SSH tunnel) service on some macOS systems. If you encounter "Address already in use", you can override the port in `.env` or `mise.toml` (e.g., set `PORT=8888`).

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

# Database operations (always use migrations)
mise run db:generate  # Generate new migration from schema changes
mise run db:migrate   # Apply pending migrations
mise run db:studio    # Open Drizzle Studio GUI

# CLI package
mise run cli:build    # Bundle server, copy frontend, generate migrations
mise run cli:publish  # Publish to npm (runs cli:build first)

# Version management
mise run bump         # Bump patch version (or: bump major, bump minor)
```

## Architecture

### Frontend (`frontend/`)
- **React 19** with TanStack Router (file-based routing in `frontend/routes/`)
- **TanStack React Query** for server state
- **shadcn/ui** (v4 with baseui support) for UI components
- **xterm.js** for terminal emulation
- Components organized by feature: `kanban/`, `terminal/`, `viewer/`, `ui/`
- Path alias: `@` → `./frontend/`

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
frontend/
  routes/          # Pages (TanStack Router)
  components/      # React components by feature
  hooks/           # Custom hooks (use-tasks, use-terminal-ws, etc.)
  stores/          # MobX State Tree stores for terminal/tab state
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

## Terminal Architecture

For detailed documentation on the terminal implementation including:
- MobX State Tree data model
- WebSocket message protocol
- Optimistic updates and tempId → realId transitions
- Critical gotchas and race conditions

See [frontend/stores/terminal-architecture.md](frontend/stores/terminal-architecture.md).

## CLI Package

The `vibora` package provides a global CLI for running Vibora as a daemon. The built CLI package includes:

- `cli/server/index.js` - Bundled server
- `cli/dist/` - Pre-built frontend assets
- `cli/drizzle/` - SQL migrations
- `cli/lib/librust_pty.so` - Native PTY library

### Building

```bash
mise run cli:build    # Bundle server, copy frontend, generate migrations
mise run cli:publish  # Publish to npm (runs cli:build first)
```

## Developer Mode

Developer mode enables additional features useful for Vibora development:

- **Restart Button**: A "Restart Vibora" button appears in Settings that builds and restarts the server
- **Vibora Instances Tab**: Shows running Vibora instances in the Monitoring page

### Enabling Developer Mode

Set the `VIBORA_DEVELOPER` environment variable:

```bash
VIBORA_DEVELOPER=1 bun server/index.ts
```

Or use the systemd service (see below).

## Systemd User Service

For remote development scenarios (SSH + Tailscale), Vibora can be run as a systemd user service. This allows restarting the server from within Vibora itself.

### Installation

Create a systemd user service file at `~/.config/systemd/user/vibora.service`. The service should build the frontend, run migrations, and start the server. See [systemd documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html) for details.

```bash
# After creating the service file
systemctl --user daemon-reload
systemctl --user enable vibora
```

### First Start

The service builds before stopping the old instance, so if the build fails, the old instance keeps running:

```bash
systemctl --user start vibora
```

This is safe to run even if Vibora is already running via `mise run up`.

### How Restart Works

The systemd service runs these steps in order via `ExecStartPre`:
1. `mise run build:debug` - Build frontend with debug logging enabled
2. Migrations run automatically on server start
3. `mise run down` - Stop any daemon instance
4. `bun server/index.ts` - Start the new instance

If any `ExecStartPre` step fails, the service won't start and the old instance keeps running.

### Manual Operations

```bash
# Start the server
systemctl --user start vibora

# Stop the server
systemctl --user stop vibora

# Restart (rebuild and restart)
systemctl --user restart vibora

# Check status
systemctl --user status vibora

# View logs
journalctl --user -u vibora -f
```

### Restarting from the UI

When running in developer mode, the Settings page shows a "Restart Vibora" button. Clicking it:

1. **Triggers systemctl restart**: The button calls `systemctl --user restart vibora`
2. **Systemd handles everything**: The service builds, migrates, and restarts
3. **Fails safely**: If build fails, old instance keeps running (check logs with `journalctl`)
4. **Auto-reloads**: The page polls for the new server and reloads when it's back

### Restarting from the CLI

You can also trigger a restart from the command line:

```bash
# Check if developer mode is enabled
vibora dev status

# Build and restart (only works in developer mode)
vibora dev restart
```

The CLI provides the same two-phase safety as the UI button.

### Linger for Persistent Services

To keep the service running even when not logged in:

```bash
loginctl enable-linger $USER
```
