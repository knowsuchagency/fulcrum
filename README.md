# Vibora

![vibora](https://github.com/user-attachments/assets/e58c762c-5598-4e5a-a992-9bef5d614f7d)


A lightweight PM cockpit for streamlining the software development lifecycle. Vibora marries basic project management with actual software development by embedding terminals directly into the workflow.

## Philosophy

- **Terminal-first AI agent orchestration** — Agents (Claude Code, Codex, etc.) run in terminals as-is. No abstraction layer, no wrapper APIs, no feature parity maintenance as agents evolve.
- **Opinionated with few opinions** — Provides structure without dictating workflow.
- **Git worktree isolation** — Tasks create isolated git worktrees, with architecture supporting evolution toward more general task types.

## Tech Stack

- **Frontend**: React 19, TanStack Router & Query, xterm.js, Tailwind CSS
- **Backend**: Hono.js on Bun, SQLite with Drizzle ORM, WebSocket for terminal I/O

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) for task running and tool management
- [Bun](https://bun.sh/) (installed automatically via mise)

### Development

```bash
# Install dependencies
bun install

# Start both frontend and backend (recommended)
mise run dev

# Or run separately:
mise run server    # Backend (port 3333, with auto-reload)
mise run client    # Frontend (port 5173, proxies to backend)
```

### Available Tasks

```bash
mise run dev          # Start frontend and backend dev servers
mise run server       # Start backend dev server with auto-reload
mise run client       # Start frontend dev server
mise run build        # Build for production
mise run start        # Run production server
mise run lint         # Run ESLint
mise run preview      # Preview production build

# Database operations
mise run db:push      # Sync schema to database
mise run db:studio    # Open Drizzle Studio GUI
mise run db:generate  # Generate migrations
mise run db:migrate   # Apply migrations
```

## Configuration

Settings are stored in `.vibora/settings.json`. The server checks for a `.vibora` directory in the current working directory first, falling back to `~/.vibora`.

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

## License

[MIT](LICENSE)
