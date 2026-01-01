# Introduction

Vibora is a terminal-first command center for orchestrating AI coding agents across parallel workstreams.

## Why Vibora?

**For developers who take Claude Code seriously.** Not as a novelty, but as their primary interface for getting things done. If you live in the terminal and want to run multiple Claude Code sessions across isolated workstreams, Vibora is your cockpit.

## Key Features

### Full Development Lifecycle

From development to deployment, all from one open-source platform. Develop features in isolated worktrees, then deploy them to production on your own hardware.

### Task Terminals View

See and control all your Claude Code sessions across every worktree in one parallel view. The killer feature for orchestrating multiple agents simultaneously.

### Local or Remote Execution

Client/server architecture lets you run agents on your machine or a remote server. Launch tasks, close your laptop, and your agents keep working.

### Git Worktree Isolation

Each task runs in its own worktree. Your main branch stays clean until you're ready to merge.

### Docker Compose Deployment

Deploy apps with standard Docker Compose files. Automatic domain routing with Traefik, optional Cloudflare DNS integration, and real-time build logs.

### Persistent Terminals

Named terminal tabs that survive restarts for ongoing work that doesn't fit into task worktrees.

## Feature Overview

| Feature | Description |
|---------|-------------|
| **App Deployment** | Deploy Docker Compose apps with automatic domain routing and DNS |
| **Parallel Agent Orchestration** | Run multiple Claude Code sessions across different tasks and worktrees |
| **Local or Remote Execution** | Run on your machine or a remote server; agents continue working when you disconnect |
| **Git Worktree Isolation** | Safe experimentation without touching your main branch |
| **Claude Code Plugin** | Skill for task management, automatic status sync, session continuity |
| **MCP Server** | Let Claude manage tasks, list repositories, and send notifications |
| **Kanban Task Management** | Visual task tracking from planning to done |
| **PR Monitoring** | Track pull requests across repositories |
| **Linear Integration** | Sync task status with Linear tickets |
| **System Monitoring** | CPU, memory, and disk usage at a glance |
| **Cross-Platform** | Desktop app (Mac, Linux) or web application |

## Next Steps

- [Quick Start](/guide/quick-start) - Install and run Vibora
- [Tasks & Worktrees](/guide/tasks) - Learn about task management
- [App Deployment](/guide/apps) - Deploy Docker Compose applications
- [Terminal Management](/guide/terminals) - Work with terminals
