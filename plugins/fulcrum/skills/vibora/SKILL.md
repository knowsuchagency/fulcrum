---
name: fulcrum
description: Fulcrum is a terminal-first tool for orchestrating AI coding agents across isolated git worktrees. Use this skill when working in a Fulcrum task worktree or managing tasks.
---

# Fulcrum - AI Agent Orchestration

## Overview

Fulcrum is a terminal-first tool for orchestrating AI coding agents (like Claude Code) across isolated git worktrees. Each task runs in its own worktree, enabling parallel work on multiple features or fixes without branch switching.

**Philosophy:**
- Agents run natively in terminals - no abstraction layer or wrapper APIs
- Tasks create isolated git worktrees for clean separation
- Persistent terminals organized in tabs across tasks

## When to Use This Skill

Use the Fulcrum CLI when:
- **Working in a task worktree** - Use `current-task` commands to manage your current task
- **Updating task status** - Mark tasks as in-progress, ready for review, done, or canceled
- **Linking PRs** - Associate a GitHub PR with the current task
- **Linking Linear tickets** - Connect a Linear issue to the current task
- **Linking URLs** - Attach any relevant URLs (design docs, specs, external resources) to the task
- **Sending notifications** - Alert the user when work is complete or needs attention

Use the Fulcrum MCP tools when:
- **Executing commands remotely** - Run shell commands on the Fulcrum server from Claude Desktop
- **Stateful workflows** - Use persistent sessions to maintain environment variables and working directory across commands

## Core CLI Commands

### current-task (Primary Agent Workflow)

When running inside a Fulcrum task worktree, use these commands to manage the current task:

```bash
# Get current task info (JSON output)
fulcrum current-task

# Update task status
fulcrum current-task in-progress   # Mark as IN_PROGRESS
fulcrum current-task review        # Mark as IN_REVIEW (notifies user)
fulcrum current-task done          # Mark as DONE
fulcrum current-task cancel        # Mark as CANCELED

# Link a GitHub PR to the current task
fulcrum current-task pr <github-pr-url>

# Link a Linear ticket to the current task
fulcrum current-task linear <linear-issue-url>

# Add arbitrary URL links to the task
fulcrum current-task link <url>                  # Add link (auto-detects type/label)
fulcrum current-task link <url> --label "Docs"   # Add link with custom label
fulcrum current-task link                        # List all links
fulcrum current-task link --remove <url-or-id>   # Remove a link
```

### tasks

Manage tasks across the system:

```bash
# List all tasks
fulcrum tasks list
fulcrum tasks list --status=IN_PROGRESS   # Filter by status
fulcrum tasks list --search="ocai"        # Search by title, labels
fulcrum tasks list --label="bug"          # Filter by label

# List all labels in use
fulcrum tasks labels                      # Show all labels with counts
fulcrum tasks labels --search="comm"      # Find labels matching substring

# Get a specific task
fulcrum tasks get <task-id>

# Create a new task
fulcrum tasks create --title="My Task" --repo=/path/to/repo

# Update task metadata
fulcrum tasks update <task-id> --title="New Title"

# Move task to different status
fulcrum tasks move <task-id> --status=IN_REVIEW

# Delete a task
fulcrum tasks delete <task-id>
fulcrum tasks delete <task-id> --delete-worktree   # Also delete worktree
```

### notifications

Send notifications to the user:

```bash
# Send a notification
fulcrum notify "Title" "Message body"

# Check notification settings
fulcrum notifications

# Enable/disable notifications
fulcrum notifications enable
fulcrum notifications disable

# Test a notification channel
fulcrum notifications test sound
fulcrum notifications test slack
fulcrum notifications test discord
fulcrum notifications test pushover

# Configure a channel
fulcrum notifications set slack webhookUrl <url>
```

### Server Management

```bash
fulcrum up          # Start Fulcrum server daemon
fulcrum down        # Stop Fulcrum server
fulcrum status      # Check if server is running
fulcrum health      # Check server health
```

### Git Operations

```bash
fulcrum git status              # Git status for current worktree
fulcrum git diff                # Git diff for current worktree
fulcrum worktrees list          # List all worktrees
```

### projects

Manage projects (repositories with metadata):

```bash
# List all projects
fulcrum projects list
fulcrum projects list --status=active    # Filter by status (active, archived)

# Get project details
fulcrum projects get <project-id>

# Create a new project
fulcrum projects create --name="My Project" --path=/path/to/repo          # From local path
fulcrum projects create --name="My Project" --url=https://github.com/...  # Clone from URL
fulcrum projects create --name="My Project" --repository-id=<repo-id>     # Link existing repo

# Update project
fulcrum projects update <project-id> --name="New Name"
fulcrum projects update <project-id> --status=archived

# Delete project
fulcrum projects delete <project-id>
fulcrum projects delete <project-id> --delete-directory   # Also delete directory
fulcrum projects delete <project-id> --delete-app         # Also delete linked app

# Scan for git repositories
fulcrum projects scan                        # Scan default directory
fulcrum projects scan --directory=/path      # Scan specific directory

# Manage project links (URLs)
fulcrum projects links list <project-id>
fulcrum projects links add <project-id> <url> --label="Custom Label"
fulcrum projects links remove <project-id> <link-id>
```

### repositories

Manage repositories (code sources that can be linked to projects):

```bash
# List repositories
fulcrum repositories list
fulcrum repositories list --orphans          # Unlinked repos only
fulcrum repositories list --project-id=<id>  # Filter by project

# Get repository details
fulcrum repositories get <repo-id>

# Add a new repository from local path
fulcrum repositories add --path=/path/to/repo
fulcrum repositories add --path=/path/to/repo --display-name="My Repo"

# Update repository
fulcrum repositories update <repo-id> --display-name="New Name"
fulcrum repositories update <repo-id> --default-agent=claude
fulcrum repositories update <repo-id> --startup-script="mise run dev"
fulcrum repositories update <repo-id> --copy-files=".env,.env.local"

# Delete orphaned repository (fails if linked to a project)
fulcrum repositories delete <repo-id>

# Link repository to project (repos can only be linked to one project)
fulcrum repositories link <repo-id> <project-id>
fulcrum repositories link <repo-id> <project-id> --as-primary
fulcrum repositories link <repo-id> <project-id> --force  # Move from existing project

# Unlink repository from project
fulcrum repositories unlink <repo-id> <project-id>
```

### apps

Manage Docker Compose app deployments:

```bash
# List all apps
fulcrum apps list
fulcrum apps list --status=running   # Filter by status (stopped, building, running, failed)

# Get app details
fulcrum apps get <app-id>

# Create a new app
fulcrum apps create --name="My App" --repository-id=<repo-id>
fulcrum apps create --name="My App" --repository-id=<repo-id> --branch=develop --auto-deploy

# Update app
fulcrum apps update <app-id> --name="New Name"
fulcrum apps update <app-id> --auto-deploy      # Enable auto-deploy
fulcrum apps update <app-id> --no-cache         # Enable no-cache builds

# Deploy an app
fulcrum apps deploy <app-id>

# Stop an app
fulcrum apps stop <app-id>

# Get logs
fulcrum apps logs <app-id>                     # All services
fulcrum apps logs <app-id> --service=web       # Specific service
fulcrum apps logs <app-id> --tail=200          # Last 200 lines

# Get container status
fulcrum apps status <app-id>

# Get deployment history
fulcrum apps deployments <app-id>

# Delete an app
fulcrum apps delete <app-id>
fulcrum apps delete <app-id> --keep-containers   # Keep containers running
```

### fs (Filesystem)

Remote filesystem operations for reading/writing files on the Fulcrum server. These tools are designed for working with a **remote Fulcrum instance** - they allow AI agents to read/write files on the server's filesystem through the API, which is useful when the agent runs on a different machine than the Fulcrum server.

```bash
# List directory contents
fulcrum fs list                     # Home directory
fulcrum fs list --path=/path/to/dir

# Get file tree
fulcrum fs tree --root=/path/to/worktree

# Read a file (with path traversal protection)
fulcrum fs read --path=src/index.ts --root=/path/to/worktree
fulcrum fs read --path=src/index.ts --root=/path/to/worktree --max-lines=100

# Write to a file (replaces entire content)
fulcrum fs write --path=src/index.ts --root=/path/to/worktree --content="..."

# Edit a file (replace a unique string)
fulcrum fs edit --path=src/index.ts --root=/path/to/worktree --old-string="foo" --new-string="bar"

# Get file/directory info
fulcrum fs stat --path=/path/to/check
```

## Agent Workflow Patterns

### Typical Task Lifecycle

1. **Task Creation**: User creates a task in Fulcrum UI or CLI
2. **Work Begins**: Agent starts working, task auto-marked IN_PROGRESS via hook
3. **PR Created**: Agent creates PR and links it: `fulcrum current-task pr <url>`
4. **Ready for Review**: Agent marks complete: `fulcrum current-task review`
5. **Notification**: User receives notification that work is ready

### Linking External Resources

```bash
# After creating a GitHub PR
fulcrum current-task pr https://github.com/owner/repo/pull/123

# After identifying the relevant Linear ticket
fulcrum current-task linear https://linear.app/team/issue/TEAM-123

# Add any URL link (design docs, figma, notion, external resources)
fulcrum current-task link https://figma.com/file/abc123/design
fulcrum current-task link https://notion.so/team/spec --label "Product Spec"
```

### Notifying the User

```bash
# When work is complete
fulcrum notify "Task Complete" "Implemented the new feature and created PR #123"

# When blocked or need input
fulcrum notify "Need Input" "Which approach should I use for the database migration?"
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

Fulcrum provides a comprehensive set of MCP tools for AI agents. Use `search_tools` to discover available tools.

### Tool Discovery

#### search_tools

Search for available tools by keyword or category:

```json
{
  "query": "deploy",      // Optional: Search term
  "category": "apps"      // Optional: Filter by category
}
```

**Categories:** core, tasks, projects, repositories, apps, filesystem, git, notifications, exec

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

### Repository Tools

- `list_repositories` - List all repositories (supports orphans filter)
- `get_repository` - Get repository details by ID
- `add_repository` - Add repository from local path
- `update_repository` - Update repository metadata (name, agent, startup script)
- `delete_repository` - Delete orphaned repository (fails if linked to project)
- `link_repository_to_project` - Link repo to project (errors if already linked elsewhere)
- `unlink_repository_from_project` - Unlink repo from project

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

Remote filesystem tools for working with files on the Fulcrum server. Useful when the agent runs on a different machine than the server (e.g., via SSH tunneling to Claude Desktop).

- `list_directory` - List directory contents
- `get_file_tree` - Get recursive file tree
- `read_file` - Read file contents (secured)
- `write_file` - Write entire file content (secured)
- `edit_file` - Edit file by replacing a unique string (secured)
- `file_stat` - Get file/directory metadata
- `is_git_repo` - Check if directory is git repo

### Command Execution

When using Claude Desktop with Fulcrum's MCP server, you can execute commands on the remote Fulcrum server. This is useful when connecting to Fulcrum via SSH port forwarding.

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
2. **Link PRs immediately** - Run `fulcrum current-task pr <url>` right after creating a PR
3. **Link relevant resources** - Attach design docs, specs, or reference materials with `fulcrum current-task link <url>`
4. **Mark review when done** - `fulcrum current-task review` notifies the user
5. **Send notifications for blocking issues** - Keep the user informed of progress
6. **Name sessions for identification** - Use descriptive names to find sessions later
7. **Reuse sessions for related commands** - Preserve state across multiple execute_command calls
8. **Clean up sessions when done** - Use destroy_exec_session to free resources
