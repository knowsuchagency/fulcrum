# Configuration

Vibora is configured through settings files and environment variables.

## Settings Location

Settings are stored in `.vibora/settings.json`. The vibora directory is resolved in this order:

1. `VIBORA_DIR` environment variable (explicit override)
2. `.vibora` in current working directory (per-worktree isolation)
3. `~/.vibora` (default)

## Configuration Options

### Server

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `server.port` | `PORT` | `7777` | Server port |

### Paths

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `paths.defaultGitReposDir` | `VIBORA_GIT_REPOS_DIR` | `~` | Default directory for repositories |

### Editor

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `editor.sshPort` | `VIBORA_SSH_PORT` | `22` | SSH port for remote editor connections |

### Agent

| Setting | Default | Description |
|---------|---------|-------------|
| `agent.defaultAgent` | `claude` | Default AI agent (`claude` or `opencode`) |

The default agent can be overridden per-repository and per-task.

### Integrations

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `integrations.linearApiKey` | `LINEAR_API_KEY` | `null` | Linear API key for ticket sync |
| `integrations.githubPat` | `GITHUB_PAT` | `null` | GitHub PAT for private repos |

### Appearance

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `appearance.language` | — | `null` | UI language (auto-detect if null) |

### Notifications

Notification settings are configured via the Settings UI or CLI:

| Setting | Description |
|---------|-------------|
| `notifications.sound.enabled` | Enable sound notifications |
| `notifications.slack.enabled` | Enable Slack notifications |
| `notifications.slack.webhookUrl` | Slack webhook URL |
| `notifications.discord.enabled` | Enable Discord notifications |
| `notifications.discord.webhookUrl` | Discord webhook URL |
| `notifications.pushover.enabled` | Enable Pushover notifications |
| `notifications.pushover.userKey` | Pushover user key |
| `notifications.pushover.appToken` | Pushover app token |

## Precedence

Configuration values are resolved in this order (highest to lowest priority):

1. Environment variable
2. `settings.json` value
3. Default value

## CLI Configuration

### Get a value

```bash
vibora config get server.port
vibora config get integrations.linearApiKey
```

### Set a value

```bash
vibora config set server.port 8080
vibora config set integrations.linearApiKey YOUR_KEY
```

## Database

The SQLite database is stored at `{viboraDir}/vibora.db`. This location is derived from the vibora directory and is not separately configurable.

The database uses WAL mode for better concurrent access.

## Worktrees

Worktrees are stored at `{viboraDir}/worktrees/`. This location is derived from the vibora directory and is not separately configurable.

## Logs

| Log File | Description |
|----------|-------------|
| `{viboraDir}/server.log` | Server stdout/stderr (daemon mode) |
| `{viboraDir}/vibora.log` | Application logs (JSONL format) |

### Log Levels

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Backend minimum log level |
| `VITE_LOG_LEVEL` | `info` | Frontend minimum log level |
| `DEBUG` | `0` | Enable frontend debug logging |

Available levels: `debug`, `info`, `warn`, `error`

## Example settings.json

```json
{
  "server": {
    "port": 7777
  },
  "paths": {
    "defaultGitReposDir": "/home/user/projects"
  },
  "editor": {
    "sshPort": 22
  },
  "agent": {
    "defaultAgent": "claude"
  },
  "integrations": {
    "linearApiKey": null,
    "githubPat": null
  },
  "appearance": {
    "language": null
  },
  "notifications": {
    "sound": {
      "enabled": true
    }
  }
}
```
