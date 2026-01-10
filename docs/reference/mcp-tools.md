# MCP Tools

The Vibora plugin includes an MCP server that exposes task management and remote execution tools to AI coding agents.

## Setup

### Claude Code

The MCP server is automatically available when using the Vibora plugin with Claude Code.

### OpenCode

The MCP server is automatically configured when you install the Vibora plugin:

```bash
vibora opencode install
```

This adds the Vibora MCP server to `~/.opencode/opencode.json`. You can verify the configuration:

```json
{
  "mcp": {
    "vibora": {
      "type": "local",
      "command": ["vibora", "mcp"],
      "enabled": true
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vibora": {
      "command": "vibora",
      "args": ["mcp"]
    }
  }
}
```

## Task Management Tools

### `list_tasks`

List all tasks with optional filtering.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `status` | string | Filter by status (IN_PROGRESS, IN_REVIEW, DONE, CANCELED) |
| `repo` | string | Filter by repository name or path |

**Example:**
```json
{
  "status": "IN_PROGRESS",
  "repo": "my-project"
}
```

### `get_task`

Get details about a specific task.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | string | Task ID (required) |

### `create_task`

Create a new task with git worktree.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `title` | string | Task title (required) |
| `repoPath` | string | Absolute path to the git repository (required) |
| `baseBranch` | string | Base branch for the worktree (default: main) |
| `branch` | string | Branch name for the task worktree (auto-generated if omitted) |
| `description` | string | Task description |

### `update_task`

Update a task's title or description.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | string | Task ID (required) |
| `title` | string | New title |
| `description` | string | New description |

### `delete_task`

Delete a task and optionally its linked git worktree.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | string | Task ID (required) |
| `deleteWorktree` | boolean | Also delete the linked git worktree (default: false) |

### `move_task`

Move a task to a different status column.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | string | Task ID (required) |
| `status` | string | Target status (IN_PROGRESS, IN_REVIEW, DONE, CANCELED) |
| `position` | number | Position in the column (0-indexed, defaults to end) |

### `list_repositories`

List all configured repositories.

**Parameters:** None

### `send_notification`

Send a notification to enabled channels.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `title` | string | Notification title (required) |
| `message` | string | Notification message |

## Remote Execution Tools

### `execute_command`

Execute a shell command on the Vibora server. Supports persistent sessions for stateful workflows.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `command` | string | Command to execute (required) |
| `sessionId` | string | Session ID for stateful workflows. Omit to create new session. Reuse to maintain state. |
| `cwd` | string | Initial working directory (only used when creating new session) |
| `timeout` | number | Timeout in milliseconds (default: 30000) |
| `name` | string | Optional session name for identification (only used when creating new session) |

**Features:**
- Persistent sessions with preserved environment
- Working directory persists between commands
- Shell state (aliases, functions) preserved

**Example:**
```json
{
  "command": "npm install",
  "sessionId": "my-session",
  "name": "Project Setup"
}
```

### `list_exec_sessions`

List active command execution sessions.

**Parameters:** None

**Returns:**
- Session IDs
- Session names
- Working directories
- Creation timestamps

### `update_exec_session`

Update an existing command execution session (e.g., rename it).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sessionId` | string | Session ID (required) |
| `name` | string | New name for the session |

### `destroy_exec_session`

Clean up a session.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sessionId` | string | Session ID (required) |

## Example Usage

Claude can use these tools to manage tasks autonomously:

```
I'll create a new task for implementing the authentication feature.

[Uses create_task with title "Add user authentication" and repoPath "/path/to/repo"]

Task created. Let me check the current status of all tasks.

[Uses list_tasks with status "IN_PROGRESS"]

I see there are 3 tasks in progress. I'll update the description of the auth task.

[Uses update_task with id and new description]
```

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "Task not found",
  "code": "NOT_FOUND"
}
```

Common error codes:
- `NOT_FOUND` — Resource doesn't exist
- `INVALID_INPUT` — Invalid parameters
- `PERMISSION_DENIED` — Operation not allowed
- `SERVER_ERROR` — Internal error
