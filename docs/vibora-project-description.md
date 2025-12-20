# Vibora - Project Description

## Overview

Vibora is a web application for managing development tasks and terminal sessions on a remote development machine. It combines a kanban-style task board with integrated terminal management, designed for a workflow where each task corresponds to an isolated git worktree.

## Core Concept

**Task = Worktree**

Every task in Vibora is backed by a git worktree. When you create a task, you specify a source repository and branch name, and Vibora creates an isolated worktree for that work. This enforces clean separation between tasks and makes context-switching trivial.

## Key Features

### 1. Task Management (Kanban Board)

- Tasks displayed in a kanban board with columns: TODO, IN PROGRESS, IN REVIEW, DONE, CANCELLED
- Drag-and-drop to change task status
- Each task card shows: title, repo name, branch name
- Clicking a task opens the Task View

### 2. Task View (Development Workspace)

When working on a task, the user sees a split-pane view:

- **Left pane**: Terminal (xterm.js) automatically cd'd to the task's worktree
- **Right pane**: Toggle between:
  - **Diffs view**: Shows uncommitted changes in the worktree (git diff)
  - **Browser view**: Embedded iframe for previewing localhost URLs

### 3. Terminals View (Global Terminal Management)

Independent of tasks, users can manage arbitrary terminal sessions:

- Organize terminals into named **tabs**
- Each tab can display 1-4 terminals in various **layouts**:
  - Single terminal (1)
  - Two horizontal split (2h)
  - Two vertical split (2v)
  - One tall left + two stacked right (3)
  - Four-way grid (4)
- Terminals and tabs can be renamed
- Useful for: dev servers, monitoring, SSH sessions, etc.

## Technical Requirements

### Frontend

- React (or similar) SPA
- xterm.js for terminal emulation
- WebSocket connection to backend for PTY sessions
- Responsive design: desktop-first, but usable on mobile
- Drag-and-drop for kanban (react-beautiful-dnd or similar)

### Backend

- Manages PTY sessions (node-pty or equivalent)
- WebSocket server for terminal I/O
- Git operations: create worktrees, get diff output
- SQLite or similar for persistence
- REST API for task/terminal CRUD operations

### Git Integration

- Create worktrees: `git worktree add <path> -b <branch> <base-branch>`
- List branches for repo selection
- Get diffs: `git diff` output for the diffs view
- Cleanup: `git worktree remove` when tasks are deleted (optional/configurable)

## Data Model

### Task

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | yes | Primary key |
| title | string | yes | Task title |
| description | string | no | Optional description |
| status | enum | yes | todo, in_progress, in_review, done, cancelled |
| position | integer | yes | Order within status column |
| repo_path | string | yes | Absolute path to source git repo |
| repo_name | string | yes | Display name (derived from path) |
| base_branch | string | yes | Branch we created worktree from (e.g., main) |
| branch_name | string | yes | New branch name for this task |
| worktree_path | string | yes | Absolute path to worktree directory |
| created_at | timestamp | yes | Creation timestamp |

### TerminalTab

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | yes | Primary key |
| name | string | yes | Tab display name |
| layout | enum | yes | 1, 2h, 2v, 3, 4 |
| position | integer | yes | Order in tab bar |

### Terminal

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | yes | Primary key |
| tab_id | uuid | nullable | FK to TerminalTab (for global terminals) |
| task_id | uuid | nullable | FK to Task (for task terminals) |
| name | string | yes | Terminal display name |
| position | integer | yes | Slot position in layout (0-3) |
| pty_session_id | string | yes | Backend PTY session identifier |

**Note**: A terminal belongs to either a tab OR a task, never both. Exactly one of `tab_id` or `task_id` must be set.

### Config

| Field | Type | Description |
|-------|------|-------------|
| worktrees_dir | string | Default directory for worktrees (e.g., ~/worktrees) |
| repos | array | List of {path, name} for quick repo selection in task creation |

## User Flows

### Create Task

1. User clicks "+ New Task" on kanban board
2. Modal opens with form:
   - Title (required) - auto-generates branch name slug
   - Description (optional)
   - Repo (required) - dropdown of configured repos or type path
   - Base branch (required) - dropdown populated from selected repo
   - Branch name (required) - auto-filled from title, editable
   - Worktree path shown (computed, read-only)
3. On submit:
   - Backend runs: `git worktree add {worktrees_dir}/{branch} -b {branch} {base_branch}`
   - Task record created with status "todo"
   - Task appears in TODO column

### Work on Task

1. User clicks task card in kanban
2. Task View opens:
   - Terminal spawns, cd'd to worktree_path
   - Diffs panel shows current uncommitted changes
3. User works in terminal (run tests, use claude code, etc.)
4. Diffs panel updates on refresh/poll
5. User can toggle to browser view for localhost preview
6. User can change status via dropdown without leaving view
7. Back arrow returns to kanban

### Manage Terminals

1. User clicks "terminals" in nav
2. Terminals View shows tabs and terminal grid
3. User can:
   - Create new tabs
   - Rename tabs
   - Add terminals to current tab
   - Rename terminals
   - Change tab layout
   - Close terminals/tabs

## Responsive Design

### Desktop (primary)

- Full kanban board visible
- Task view shows side-by-side panes
- Terminals view shows full grid layout

### Mobile (functional, not primary)

- Kanban: swipe between columns, one column visible at a time
- Task view: stacked layout, tab bar to switch between terminal/diffs/browser
- Terminals: one terminal visible at a time, dropdown to switch

## Navigation

- Top nav with logo and two main sections: [tasks] [terminals]
- Settings accessible via gear icon
- Task view has back button to return to kanban

## Future Considerations (Out of Scope for MVP)

- GitHub/GitLab integration for PR creation
- Task syncing with Linear/GitHub Issues
- Multiple terminal panes in task view
- Terminal session persistence/reconnection
- Task templates
- Keyboard shortcuts
- Search/filter on kanban
