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
- **Linking URLs** - Attach any relevant URLs (design docs, specs, external resources) to the task
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

# Add arbitrary URL links to the task
vibora current-task link <url>                  # Add link (auto-detects type/label)
vibora current-task link <url> --label "Docs"   # Add link with custom label
vibora current-task link                        # List all links
vibora current-task link --remove <url-or-id>   # Remove a link
```

### tasks

Manage tasks across the system:

```bash
# List all tasks
vibora tasks list
vibora tasks list --status=IN_PROGRESS   # Filter by status
vibora tasks list --search="ocai"        # Search by title, labels
vibora tasks list --label="bug"          # Filter by label

# List all labels in use
vibora tasks labels                      # Show all labels with counts
vibora tasks labels --search="comm"      # Find labels matching substring

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

### projects

Manage projects (repositories with metadata):

```bash
# List all projects
vibora projects list
vibora projects list --status=active    # Filter by status (active, archived)

# Get project details
vibora projects get <project-id>

# Create a new project
vibora projects create --name="My Project" --path=/path/to/repo          # From local path
vibora projects create --name="My Project" --url=https://github.com/...  # Clone from URL
vibora projects create --name="My Project" --repository-id=<repo-id>     # Link existing repo

# Update project
vibora projects update <project-id> --name="New Name"
vibora projects update <project-id> --status=archived

# Delete project
vibora projects delete <project-id>
vibora projects delete <project-id> --delete-directory   # Also delete directory
vibora projects delete <project-id> --delete-app         # Also delete linked app

# Scan for git repositories
vibora projects scan                        # Scan default directory
vibora projects scan --directory=/path      # Scan specific directory

# Manage project links (URLs)
vibora projects links list <project-id>
vibora projects links add <project-id> <url> --label="Custom Label"
vibora projects links remove <project-id> <link-id>
```

### apps

Manage Docker Compose app deployments:

```bash
# List all apps
vibora apps list
vibora apps list --status=running   # Filter by status (stopped, building, running, failed)

# Get app details
vibora apps get <app-id>

# Create a new app
vibora apps create --name="My App" --repository-id=<repo-id>
vibora apps create --name="My App" --repository-id=<repo-id> --branch=develop --auto-deploy

# Update app
vibora apps update <app-id> --name="New Name"
vibora apps update <app-id> --auto-deploy      # Enable auto-deploy
vibora apps update <app-id> --no-cache         # Enable no-cache builds

# Deploy an app
vibora apps deploy <app-id>

# Stop an app
vibora apps stop <app-id>

# Get logs
vibora apps logs <app-id>                     # All services
vibora apps logs <app-id> --service=web       # Specific service
vibora apps logs <app-id> --tail=200          # Last 200 lines

# Get container status
vibora apps status <app-id>

# Get deployment history
vibora apps deployments <app-id>

# Delete an app
vibora apps delete <app-id>
vibora apps delete <app-id> --keep-containers   # Keep containers running
```

### fs (Filesystem)

Remote filesystem operations for reading/writing files on the Vibora server. These tools are designed for working with a **remote Vibora instance** - they allow AI agents to read/write files on the server's filesystem through the API, which is useful when the agent runs on a different machine than the Vibora server.

```bash
# List directory contents
vibora fs list                     # Home directory
vibora fs list --path=/path/to/dir

# Get file tree
vibora fs tree --root=/path/to/worktree

# Read a file (with path traversal protection)
vibora fs read --path=src/index.ts --root=/path/to/worktree
vibora fs read --path=src/index.ts --root=/path/to/worktree --max-lines=100

# Write to a file (replaces entire content)
vibora fs write --path=src/index.ts --root=/path/to/worktree --content="..."

# Edit a file (replace a unique string)
vibora fs edit --path=src/index.ts --root=/path/to/worktree --old-string="foo" --new-string="bar"

# Get file/directory info
vibora fs stat --path=/path/to/check
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

# Add any URL link (design docs, figma, notion, external resources)
vibora current-task link https://figma.com/file/abc123/design
vibora current-task link https://notion.so/team/spec --label "Product Spec"
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

## MCP Tools

Vibora provides a comprehensive set of MCP tools for AI agents. Use `search_tools` to discover available tools.

### Tool Discovery

#### search_tools

Search for available tools by keyword or category:

```json
{
  "query": "deploy",      // Optional: Search term
  "category": "apps"      // Optional: Filter by category
}
```

**Categories:** core, tasks, projects, apps, filesystem, git, notifications, exec

**Example Usage:**
```
search_tools { query: "project create" }
→ Returns tools for creating projects

search_tools { category: "filesystem" }
→ Returns all filesystem tools
```

### Task Tools

- `list_tasks` - List tasks with flexible filtering (search, labels, statuses, date range, overdue)
- `get_task` - Get task details by ID
- `create_task` - Create a new task with worktree
- `update_task` - Update task metadata
- `delete_task` - Delete a task
- `move_task` - Move task to different status
- `add_task_link` - Add URL link to task
- `remove_task_link` - Remove link from task
- `list_task_links` - List all task links
- `add_task_label` - Add a label to a task (returns similar labels to catch typos)
- `remove_task_label` - Remove a label from a task
- `set_task_due_date` - Set or clear task due date
- `list_labels` - List all unique labels in use with optional search

#### Task Search and Filtering

The `list_tasks` tool supports powerful filtering for AI agents:

```json
{
  "search": "ocai",                              // Text search across title, labels, project name
  "labels": ["bug", "urgent"],                   // Filter by multiple labels (OR logic)
  "statuses": ["TO_DO", "IN_PROGRESS"],          // Filter by multiple statuses (OR logic)
  "dueDateStart": "2026-01-18",                  // Start of date range
  "dueDateEnd": "2026-01-25",                    // End of date range
  "overdue": true                                // Only show overdue tasks
}
```

#### Label Discovery

Use `list_labels` to discover exact label names before filtering:

```json
// Find labels matching "communication"
{ "search": "communication" }
// Returns: [{ "name": "communication required", "count": 5 }]
```

This helps handle typos and variations - search first, then use the exact label name.

### Project Tools

- `list_projects` - List all projects
- `get_project` - Get project details
- `create_project` - Create from path, URL, or existing repo
- `update_project` - Update name, description, status
- `delete_project` - Delete project and optionally directory/app
- `scan_projects` - Scan directory for git repos
- `list_project_links` - List all URL links attached to a project
- `add_project_link` - Add a URL link to a project (auto-detects type)
- `remove_project_link` - Remove a URL link from a project

### App/Deployment Tools

- `list_apps` - List all deployed apps
- `get_app` - Get app details with services
- `create_app` - Create app for deployment
- `deploy_app` - Trigger deployment
- `stop_app` - Stop running app
- `get_app_logs` - Get container logs
- `get_app_status` - Get container status
- `list_deployments` - Get deployment history
- `delete_app` - Delete app

### Filesystem Tools

Remote filesystem tools for working with files on the Vibora server. Useful when the agent runs on a different machine than the server (e.g., via SSH tunneling to Claude Desktop).

- `list_directory` - List directory contents
- `get_file_tree` - Get recursive file tree
- `read_file` - Read file contents (secured)
- `write_file` - Write entire file content (secured)
- `edit_file` - Edit file by replacing a unique string (secured)
- `file_stat` - Get file/directory metadata
- `is_git_repo` - Check if directory is git repo

### Command Execution

When using Claude Desktop with Vibora's MCP server, you can execute commands on the remote Vibora server. This is useful when connecting to Vibora via SSH port forwarding.

#### execute_command

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
3. **Link relevant resources** - Attach design docs, specs, or reference materials with `vibora current-task link <url>`
4. **Mark review when done** - `vibora current-task review` notifies the user
5. **Send notifications for blocking issues** - Keep the user informed of progress
6. **Name sessions for identification** - Use descriptive names to find sessions later
7. **Reuse sessions for related commands** - Preserve state across multiple execute_command calls
8. **Clean up sessions when done** - Use destroy_exec_session to free resources
