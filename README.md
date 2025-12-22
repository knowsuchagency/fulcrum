# Vibora

![vibora](https://github.com/user-attachments/assets/fed72bab-0e66-42f3-91ac-8e024372685c)


The Vibe Engineer's Cockpit. Vibora marries basic project management with actual software development by embedding terminals directly into the workflow.

## Philosophy

- **Terminal-first AI agent orchestration** — Agents (Claude Code, Codex, etc.) run in terminals as-is. No abstraction layer, no wrapper APIs, no feature parity maintenance as agents evolve.
- **Opinionated with few opinions** — Provides structure without dictating workflow.
- **Git worktree isolation** — Tasks create isolated git worktrees, with architecture supporting evolution toward more general task types.

## Requirements

- [Bun](https://bun.sh/) — JavaScript runtime
- [dtach](https://github.com/crigler/dtach) — Terminal session persistence

## Tech Stack

- **Frontend**: React 19, TanStack Router & Query, xterm.js, Tailwind CSS, shadcn/ui (v4 with baseui support)
- **Backend**: Hono.js on Bun, SQLite with Drizzle ORM, WebSocket for terminal I/O

## Quick Start

Run the latest vibora with a single command:

```bash
bunx vibora@latest up
```

This starts the vibora server as a daemon. Open http://localhost:3333 in your browser.

```bash
bunx vibora@latest down    # Stop the server
bunx vibora@latest status  # Check if running
```

## Configuration

Settings are stored in `.vibora/settings.json`.

| Setting | Env Var | Default |
|---------|---------|---------|
| (base directory) | `VIBORA_DIR` | .vibora in CWD or ~/.vibora |
| port | `PORT` | 3333 |
| defaultGitReposDir | `VIBORA_GIT_REPOS_DIR` | ~ |
| taskCreationCommand | `VIBORA_TASK_CREATION_COMMAND` | `claude --dangerously-skip-permissions` |
| hostname | `VIBORA_HOSTNAME` | (empty) |
| sshPort | `VIBORA_SSH_PORT` | 22 |
| linearApiKey | `LINEAR_API_KEY` | null |
| githubPat | `GITHUB_PAT` | null |

Notification settings (sound, Slack, Discord, Pushover) are configured via the Settings UI and stored in `settings.json`.

Precedence: environment variable → settings.json → default

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) for task running and tool management
- [Bun](https://bun.sh/) (installed automatically via mise)

### Development

```bash
# Install tools and dependencies
mise install

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

## CLI

The CLI lets AI agents (like Claude Code) working inside task worktrees query and update task status.

### Usage

```bash
# Get current task (auto-detected from worktree path)
vibora current-task

# Update task status
vibora current-task in-progress  # Mark as IN_PROGRESS
vibora current-task review       # Mark as IN_REVIEW
vibora current-task done         # Mark as DONE
vibora current-task cancel       # Mark as CANCELLED

# Server management
vibora up                        # Start server daemon
vibora down                      # Stop server
vibora status                    # Check server status

# Task management
vibora tasks list                # List all tasks
vibora tasks get <id>            # Get task by ID

# Git operations
vibora git status                # Git status for current worktree
vibora git diff                  # Git diff for current worktree
```

### Options

```bash
--port=<port>   # Server port (default: 3333)
--pretty        # Pretty-print JSON output
```

## License

[PolyForm Shield 1.0.0](LICENSE)
