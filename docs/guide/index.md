# Vibora

Run multiple AI coding agent sessions in parallel across isolated git worktrees. Supports **Claude Code** and **OpenCode** with per-repository and per-task agent selection. Monitor them all from one screen. Close your laptop—they keep working. Deploy to production when ready. Self-hosted and open source.

- **Full Development Lifecycle** — Develop features in isolated git worktrees, then deploy to production with Docker Compose. No context switching, no vendor lock-in.
- **Parallel Agent Orchestration** — Run multiple AI agent sessions across different tasks and worktrees. See and control all sessions in one parallel view.
- **Work From Anywhere** — Close your laptop—your agents keep working on your behalf. Pick up where you left off from your phone.
- **Multi-Agent Support** — Choose between Claude Code and OpenCode. Set a global default, override per-repository, or select per-task.
- **Open Source & Self-Hosted** — Inspect the code, run it anywhere, own your data. From a $5 VPS to your home lab.

## Features

### Kanban Board

Track tasks from planning to done. Create tasks that automatically spin up isolated git worktrees, and watch their status update in real-time as you work with your AI agents.

![Kanban Board](/screenshots/tasks-kanban-board.png)

### Task Terminals View

See all your AI agent sessions across every task and worktree in a single parallel view. Each task runs in an isolated git worktree, and you can monitor and interact with all of them simultaneously.

![Task Terminals View](/screenshots/terminals-view-with-tests.png)

### App Deployment

Deploy applications directly from Vibora with Docker Compose. Edit compose files inline, configure environment variables, and manage services with automatic Traefik routing and optional Cloudflare DNS integration.

![App Deployment](/screenshots/app-deployment-config.png)

### Repositories

Manage your projects with quick actions. Create new tasks, open terminals, and configure repository settings from one place.

![Repositories](/screenshots/repositories-view.png)

### Browser Preview

Preview your app alongside the agent terminal in a split-pane view. Watch changes in real-time as your AI agent iterates on your code.

![Browser Preview](/screenshots/browser-preview-split-view.png)

### System Monitoring

Keep an eye on system resources while your agents work. CPU, memory, and disk usage at a glance.

![System Monitoring](/screenshots/monitoring-system-metrics.png)

## Next Steps

- [Quick Start](/guide/quick-start) - Install and run Vibora
- [Tasks & Worktrees](/guide/tasks) - Learn about task management
- [App Deployment](/guide/apps) - Deploy Docker Compose applications
- [Terminal Management](/guide/terminals) - Work with terminals
- [Claude Plugin](/guide/claude-plugin) - Integration with Claude Code
- [OpenCode](/guide/opencode) - Integration with OpenCode
