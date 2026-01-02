# Vibora

在隔离的 git 工作树中并行运行多个 Claude Code 会话。在一个屏幕上监控所有会话。合上笔记本电脑——它们继续工作。准备就绪后部署到生产环境。自托管且开源。

- **完整开发生命周期** — 在隔离的 git 工作树中开发功能，然后使用 Docker Compose 部署到生产环境。无需切换上下文，无供应商锁定。
- **并行代理编排** — 跨不同任务和工作树运行多个 Claude Code 会话。在一个并行视图中查看和控制所有会话。
- **随时随地工作** — 合上笔记本电脑——Claude 继续为您工作。用手机随时接续之前的进度。
- **深度 Claude 集成** — 通过 MCP，Claude 可以编排任务、在远程机器上执行代码、部署应用——安全且自主。
- **开源与自托管** — 检查代码，随处运行，掌控数据。从 $5 的 VPS 到您的家庭实验室。

## 功能特性

### 看板

从计划到完成，跟踪任务进度。创建任务时自动生成隔离的 git 工作树，并在您使用 Claude Code 工作时实时更新状态。

![看板](/screenshots/tasks-kanban-board.png)

### 任务终端视图

在一个并行视图中查看所有任务和工作树的 Claude Code 会话。每个任务运行在独立的 git 工作树中，您可以同时监控和交互所有会话。

![任务终端视图](/screenshots/terminals-view-with-tests.png)

### 应用部署

使用 Docker Compose 直接从 Vibora 部署应用。内联编辑 compose 文件，配置环境变量，管理服务，支持自动 Traefik 路由和可选的 Cloudflare DNS 集成。

![应用部署](/screenshots/app-deployment-config.png)

### 仓库管理

通过快捷操作管理您的项目。在一处创建新任务、打开终端、配置仓库设置。

![仓库管理](/screenshots/repositories-view.png)

### 浏览器预览

在分屏视图中预览应用和代理终端。当 Claude 迭代您的代码时，实时观察变化。

![浏览器预览](/screenshots/browser-preview-split-view.png)

### 系统监控

在代理工作时监控系统资源。一目了然地查看 CPU、内存和磁盘使用情况。

![系统监控](/screenshots/monitoring-system-metrics.png)

## 下一步

- [快速开始](/zh/guide/quick-start) - 安装并运行 Vibora
- [任务与工作树](/zh/guide/tasks) - 了解任务管理
- [应用部署](/zh/guide/apps) - 部署 Docker Compose 应用
- [终端管理](/zh/guide/terminals) - 使用终端
