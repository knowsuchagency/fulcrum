---
name: vibora
description: Vibora is a terminal-first tool for orchestrating AI coding agents across isolated git worktrees. Use this skill when working in a Vibora task worktree or managing tasks.
---

# Vibora - AI Agent Orchestration

## Overview

Vibora is a terminal-first tool for orchestrating AI coding agents (like Claude Code) across isolated git worktrees. Each task runs in its own worktree, enabling parallel work on multiple features or fixes without branch switching.

**Philosophy:**
- Agents run natively in terminals - no abstraction layer or wrapper APIs
- Tasks create isolated git worktrees for clean separation
- Persistent terminals organized in tabs across tasks

## When to Use This Skill

Use the Vibora CLI when:
- **Working in a task worktree** - Use `current-task` commands to manage your current task
- **Updating task status** - Mark tasks as in-progress, ready for review, done, or canceled
- **Linking PRs** - Associate a GitHub PR with the current task
- **Linking Linear tickets** - Connect a Linear issue to the current task
- **Sending notifications** - Alert the user when work is complete or needs attention

Use the Vibora MCP tools when:
- **Executing commands remotely** - Run shell commands on the Vibora server from Claude Desktop
- **Stateful workflows** - Use persistent sessions to maintain environment variables and working directory across commands

## Core CLI Commands

### current-task (Primary Agent Workflow)

When running inside a Vibora task worktree, use these commands to manage the current task:

```bash
# Get current task info (JSON output)
vibora current-task

# Update task status
vibora current-task in-progress   # Mark as IN_PROGRESS
vibora current-task review        # Mark as IN_REVIEW (notifies user)
vibora current-task done          # Mark as DONE
vibora current-task cancel        # Mark as CANCELED

# Link a GitHub PR to the current task
vibora current-task pr <github-pr-url>

# Link a Linear ticket to the current task
vibora current-task linear <linear-issue-url>
```

### tasks

Manage tasks across the system:

```bash
# List all tasks
vibora tasks list
vibora tasks list --status=IN_PROGRESS   # Filter by status

# Get a specific task
vibora tasks get <task-id>

# Create a new task
vibora tasks create --title="My Task" --repo=/path/to/repo

# Update task metadata
vibora tasks update <task-id> --title="New Title"

# Move task to different status
vibora tasks move <task-id> --status=IN_REVIEW

# Delete a task
vibora tasks delete <task-id>
vibora tasks delete <task-id> --delete-worktree   # Also delete worktree
```

### notifications

Send notifications to the user:

```bash
# Send a notification
vibora notify "Title" "Message body"

# Check notification settings
vibora notifications

# Enable/disable notifications
vibora notifications enable
vibora notifications disable

# Test a notification channel
vibora notifications test sound
vibora notifications test slack
vibora notifications test discord
vibora notifications test pushover

# Configure a channel
vibora notifications set slack webhookUrl <url>
```

### Server Management

```bash
vibora up          # Start Vibora server daemon
vibora down        # Stop Vibora server
vibora status      # Check if server is running
vibora health      # Check server health
```

### Git Operations

```bash
vibora git status              # Git status for current worktree
vibora git diff                # Git diff for current worktree
vibora worktrees list          # List all worktrees
```

## Agent Workflow Patterns

### Typical Task Lifecycle

1. **Task Creation**: User creates a task in Vibora UI or CLI
2. **Work Begins**: Agent starts working, task auto-marked IN_PROGRESS via hook
3. **PR Created**: Agent creates PR and links it: `vibora current-task pr <url>`
4. **Ready for Review**: Agent marks complete: `vibora current-task review`
5. **Notification**: User receives notification that work is ready

### Linking External Resources

```bash
# After creating a GitHub PR
vibora current-task pr https://github.com/owner/repo/pull/123

# After identifying the relevant Linear ticket
vibora current-task linear https://linear.app/team/issue/TEAM-123
```

### Notifying the User

```bash
# When work is complete
vibora notify "Task Complete" "Implemented the new feature and created PR #123"

# When blocked or need input
vibora notify "Need Input" "Which approach should I use for the database migration?"
```

## Global Options

These flags work with most commands:

- `--port=<port>` - Server port (default: 7777)
- `--url=<url>` - Override full server URL
- `--pretty` - Pretty-print JSON output for human readability

## Task Statuses

- `IN_PROGRESS` - Task is being worked on
- `IN_REVIEW` - Task is complete and awaiting review
- `DONE` - Task is finished
- `CANCELED` - Task was abandoned

## MCP Tools for Remote Execution

When using Claude Desktop with Vibora's MCP server, you can execute commands on the remote Vibora server. This is useful when connecting to Vibora via SSH port forwarding.

### execute_command

Execute shell commands with optional persistent session support:

```json
{
  "command": "echo hello world",
  "sessionId": "optional-session-id",
  "cwd": "/path/to/start",
  "timeout": 30000,
  "name": "my-session"
}
```

**Parameters:**
- `command` (required) — The shell command to execute
- `sessionId` (optional) — Reuse a session to preserve env vars, cwd, and shell state
- `cwd` (optional) — Initial working directory (only used when creating new session)
- `timeout` (optional) — Timeout in milliseconds (default: 30000)
- `name` (optional) — Session name for identification (only used when creating new session)

**Response:**
```json
{
  "sessionId": "uuid",
  "stdout": "hello world",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false
}
```

### Session Workflow Example

```
1. First command (creates named session):
   execute_command { command: "cd /project && export API_KEY=secret", name: "dev-session" }
   → Returns sessionId: "abc-123"

2. Subsequent commands (reuse session):
   execute_command { command: "echo $API_KEY", sessionId: "abc-123" }
   → Returns stdout: "secret" (env var preserved)

   execute_command { command: "pwd", sessionId: "abc-123" }
   → Returns stdout: "/project" (cwd preserved)

3. Rename session if needed:
   update_exec_session { sessionId: "abc-123", name: "new-name" }

4. Cleanup when done:
   destroy_exec_session { sessionId: "abc-123" }
```

Sessions persist until manually destroyed.

### list_exec_sessions

List all active sessions with their name, current working directory, and timestamps.

### update_exec_session

Rename an existing session for identification.

### destroy_exec_session

Clean up a session when you're done to free resources.

## Best Practices

1. **Use `current-task` inside worktrees** - It auto-detects which task you're in
2. **Link PRs immediately** - Run `vibora current-task pr <url>` right after creating a PR
3. **Mark review when done** - `vibora current-task review` notifies the user
4. **Send notifications for blocking issues** - Keep the user informed of progress
5. **Name sessions for identification** - Use descriptive names to find sessions later
6. **Reuse sessions for related commands** - Preserve state across multiple execute_command calls
7. **Clean up sessions when done** - Use destroy_exec_session to free resources
