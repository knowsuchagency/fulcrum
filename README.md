# Vibora

![vibora](https://vibora-helper.knowsuchagency.workers.dev/)

The Vibe Engineer's Cockpit. A terminal-first tool for orchestrating AI coding agents across isolated git worktrees.

## Philosophy

- **Claude Code first** — Built for developers who prefer working in the terminal with CLI agents. Vibora is designed with Claude Code in mind, though it works with other CLI agents (Codex, Gemini CLI, etc.). No abstraction layer, no wrapper APIs—agents run in terminals as-is.
- **Opinionated with few opinions** — Provides structure without dictating workflow.
- **Git worktree isolation** — Tasks create isolated git worktrees, with architecture supporting evolution toward more general task types.
- **Persistent terminals** — Named terminals organized in tabs for work that doesn't fit neatly into task worktrees.
- **Task terminals view** — See all terminal sessions across all tasks and worktrees in a single parallel view.

## Quick Start

Requires [Bun](https://bun.sh/) and [Claude Code](https://claude.ai/code).

### Desktop App (Recommended)

Download the latest release for your platform from [GitHub Releases](https://github.com/knowsuchagency/vibora/releases/latest):

- **macOS Apple Silicon**: `Vibora-X.X.X-macos-arm64.dmg`
- **macOS Intel**: `Vibora-X.X.X-macos-x64.dmg`
- **Linux**: `Vibora-X.X.X-linux-x64.AppImage`

The desktop app bundles everything—just install and run. It will:
- Start the Vibora server automatically
- Install the Claude Code plugin
- Check for updates on startup

> **macOS note**: On first launch, right-click the app and select "Open" to bypass Gatekeeper.

### Web Application (Alternative)

Run Vibora as a web server if you prefer browser access or need remote server deployment.

#### Install via curl

```bash
curl -fsSL https://raw.githubusercontent.com/knowsuchagency/vibora/main/install.sh | bash
```

This installs vibora, the Claude Code plugin, and starts the server.

#### Install via npm

```bash
npx vibora@latest up
```

If using npm, install the Claude Code plugin separately for automatic task status sync:

```bash
claude plugin marketplace add knowsuchagency/vibora
claude plugin install vibora@vibora --scope user
```

Open http://localhost:7777 in your browser.

### Remote Server Setup

Run the backend on a remote server and connect from the desktop app or browser:

1. **On the remote server:**
   ```bash
   # Install and start
   npx vibora@latest up

   # Configure for remote access
   vibora config set remoteHost your-server.example.com
   vibora config set basicAuthUsername admin
   vibora config set basicAuthPassword your-secure-password
   ```

2. **Connect from desktop app:**
   - Launch the app
   - Click "Connect to Remote" (if local server not found)
   - Enter the server URL: `your-server.example.com:7777`
   - Enter credentials when prompted

3. **Or access via browser:**
   Open `http://your-server.example.com:7777`

### Server Commands (Web Application)

```bash
vibora up       # Start server daemon
vibora down     # Stop the server
vibora status   # Check if running
```

## Configuration

Settings are stored in `.vibora/settings.json`. The vibora directory is resolved in this order:

1. `VIBORA_DIR` environment variable (explicit override)
2. `.vibora` in current working directory (per-worktree isolation)
3. `~/.vibora` (default)

| Setting | Env Var | Default |
|---------|---------|---------|
| port | `PORT` | 7777 |
| defaultGitReposDir | `VIBORA_GIT_REPOS_DIR` | ~ |
| remoteHost | `VIBORA_REMOTE_HOST` | (empty) |
| sshPort | `VIBORA_SSH_PORT` | 22 |
| basicAuthUsername | `VIBORA_BASIC_AUTH_USERNAME` | null |
| basicAuthPassword | `VIBORA_BASIC_AUTH_PASSWORD` | null |
| linearApiKey | `LINEAR_API_KEY` | null |
| githubPat | `GITHUB_PAT` | null |
| language | — | null (auto-detect) |

Notification settings (sound, Slack, Discord, Pushover) are configured via the Settings UI or CLI and stored in `settings.json`.

Precedence: environment variable → settings.json → default

### Linear Integration

Vibora can sync task status with Linear tickets. Configure `linearApiKey` in settings or set the `LINEAR_API_KEY` environment variable. When a task is linked to a Linear ticket, status changes in Vibora automatically update the corresponding Linear ticket.

### Basic Auth

Set `basicAuthUsername` and `basicAuthPassword` (via settings or environment variables) to require authentication. Useful when exposing Vibora over a network.

### Claude Code Plugin

The vibora plugin for Claude Code enables automatic task status sync:

- **Task → IN_REVIEW** when Claude stops (waiting for your input)
- **Task → IN_PROGRESS** when you respond to Claude

The plugin also provides slash commands (`/review`, `/pr`, `/notify`, `/linear`, `/task-info`). The plugin is automatically installed in task worktrees when tasks are created, and Claude sessions are tied to task IDs for session continuity.

To install the plugin globally:

```bash
claude plugin marketplace add knowsuchagency/vibora
claude plugin install vibora@vibora --scope user
```

## CLI

The CLI lets AI agents (like Claude Code) working inside task worktrees query and update task status.

### Server Management

```bash
vibora up                        # Start server daemon
vibora down                      # Stop server
vibora status                    # Check server status
vibora health                    # Check server health
```

### Current Task (auto-detected from worktree)

```bash
vibora current-task              # Get current task info
vibora current-task in-progress  # Mark as IN_PROGRESS
vibora current-task review       # Mark as IN_REVIEW
vibora current-task done         # Mark as DONE
vibora current-task cancel       # Mark as CANCELED
vibora current-task pr <url>     # Associate a PR with current task
vibora current-task linear <url> # Link to a Linear ticket
```

### Task Management

```bash
vibora tasks list                # List all tasks
vibora tasks get <id>            # Get task by ID
vibora tasks create              # Create a new task
vibora tasks update <id>         # Update a task
vibora tasks move <id>           # Move task to different status
vibora tasks delete <id>         # Delete a task
```

### Git Operations

```bash
vibora git status                # Git status for current worktree
vibora git diff                  # Git diff for current worktree
vibora git branches              # List branches in a repo
```

### Worktrees

```bash
vibora worktrees list            # List all worktrees
vibora worktrees delete          # Delete a worktree
```

### Configuration

```bash
vibora config get <key>          # Get a config value
vibora config set <key> <value>  # Set a config value
```

### Notifications

```bash
vibora notifications             # Show notification settings
vibora notifications enable      # Enable notifications
vibora notifications disable     # Disable notifications
vibora notifications test <ch>   # Test a channel (sound, slack, discord, pushover)
vibora notifications set <ch> <key> <value>
                                 # Set a channel config

vibora notify <title> [message]  # Send a notification to all enabled channels
```

### Global Options

```bash
--port=<port>     # Server port (default: 7777)
--url=<url>       # Override full server URL
--pretty          # Pretty-print JSON output
```

## Internationalization

Available in English and Chinese. Set the `language` setting or let it auto-detect from your browser.

## z.ai Integration

Works with [z.ai](https://z.ai) for Claude Code proxy integration. Configure via the Settings UI.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup, architecture, and contributing guidelines.

## License

[PolyForm Shield 1.0.0](LICENSE)

**In plain English:** You can use Vibora for any purpose—personal or commercial. KNOWSUCHAGENCY CORP has no claim over the software you build using Vibora. What's prohibited is reselling or redistributing Vibora itself for profit. The software is provided as-is with no warranty.
