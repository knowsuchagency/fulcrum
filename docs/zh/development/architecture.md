# 架构

Vibora 采用客户端-服务器架构，React 前端和 Hono.js 后端都运行在 Bun 上。

## 概述

```
┌─────────────────────────────────────────────────────────────┐
│                          客户端                               │
├─────────────────┬─────────────────┬─────────────────────────┤
│     桌面应用    │     Web 浏览器   │       CLI / MCP         │
│  (Neutralino)   │                 │                          │
└────────┬────────┴────────┬────────┴──────────┬──────────────┘
         │                 │                    │
         │     HTTP/WS     │                    │ HTTP
         └────────┬────────┘                    │
                  ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vibora 服务器                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  REST API   │  │  WebSocket  │  │    MCP 服务器       │  │
│  │   /api/*    │  │ /ws/terminal│  │    (stdio)          │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         ▼                ▼                     │             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                       服务层                             ││
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────┐││
│  │  │  任务  │ │  终端  │ │  Git   │ │      集成          │││
│  │  │ 管理器 │ │ 管理器 │ │  操作  │ │ (Linear, GitHub)   │││
│  │  └────┬───┘ └────┬───┘ └────────┘ └────────────────────┘││
│  │       │          │                                       ││
│  │       │          ▼                                       ││
│  │       │    ┌──────────┐                                  ││
│  │       │    │   PTY    │ ◄──── dtach 会话                 ││
│  │       │    │  管理器  │                                  ││
│  │       │    └──────────┘                                  ││
│  │       │                                                  ││
│  │       ▼                                                  ││
│  │  ┌─────────────────────────────────────────────────────┐ ││
│  │  │                  SQLite + Drizzle                   │ ││
│  │  └─────────────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 前端

**技术栈：** React 19、TanStack Router、TanStack Query、shadcn/ui、xterm.js、MobX State Tree

### 文件结构

```
frontend/
├── routes/              # 页面（TanStack Router 文件路由）
│   ├── __root.tsx       # 根布局
│   ├── index.tsx        # 看板
│   ├── terminals.tsx    # 任务终端视图
│   ├── tabs.tsx         # 持久化终端标签页
│   ├── repositories.tsx # 仓库管理
│   ├── review.tsx       # PR 审核
│   ├── monitoring.tsx   # 系统监控
│   ├── settings.tsx     # 设置
│   └── worktrees.tsx    # 工作树管理
├── components/
│   ├── kanban/          # 看板组件
│   ├── terminal/        # 终端组件 (xterm.js)
│   ├── viewer/          # 文件/内容查看器
│   └── ui/              # shadcn/ui 组件
├── hooks/               # 自定义 hooks
│   ├── use-tasks.ts     # 任务查询和变更
│   ├── use-terminal-ws.ts  # WebSocket 连接
│   └── ...
├── stores/              # MobX State Tree 存储
│   ├── terminal-store.ts
│   └── tab-store.ts
└── lib/                 # 工具库
    └── logger.ts        # 前端日志
```

### 关键模式

- **基于文件的路由** — 路由由 `routes/` 中的文件结构定义
- **使用 React Query 管理服务器状态** — 任务、仓库等数据的获取和缓存
- **使用 MST 管理本地状态** — 终端 UI 状态使用 MobX State Tree 进行实时更新
- **终端使用 WebSocket** — 终端 I/O 通过单个 WebSocket 多路复用

## 后端

**技术栈：** Hono.js、Bun、SQLite、Drizzle ORM、bun-pty

### 文件结构

```
server/
├── index.ts             # 入口点
├── routes/
│   ├── tasks.ts         # 任务 CRUD
│   ├── repositories.ts  # 仓库管理
│   ├── terminals.ts     # 终端管理
│   ├── git.ts           # Git 操作
│   └── ...
├── services/
│   ├── pr-monitor.ts    # GitHub PR 监控
│   ├── linear.ts        # Linear 集成
│   ├── task-status.ts   # 任务状态管理
│   └── notifications.ts # 通知分发
├── terminal/
│   ├── pty-manager.ts   # PTY 生命周期
│   ├── terminal-session.ts  # dtach 会话封装
│   └── buffer-manager.ts    # 输出缓冲
├── websocket/
│   └── terminal-handler.ts  # WebSocket 协议
├── db/
│   ├── schema.ts        # Drizzle schema
│   └── init.ts          # 数据库初始化
└── lib/
    ├── settings.ts      # 配置管理
    └── logger.ts        # 后端日志
```

### 关键模式

- **REST 用于 CRUD** — 任务、仓库等的标准 REST 端点
- **WebSocket 用于流** — 终端 I/O 使用 WebSocket 进行实时数据传输
- **dtach 用于持久化** — 终端会话由 dtach 支持，在重启后存活
- **Drizzle 用于数据库** — 使用 Drizzle ORM 的类型安全 SQL 查询

## 数据流

### 任务创建

```
1. 用户在 UI 中点击"新建任务"
2. POST /api/tasks 带有 title、repositoryId
3. 服务器创建 git 工作树
4. 服务器创建数据库记录
5. 服务器为任务创建终端
6. 响应返回带有 worktreePath 的任务
7. UI 导航到任务终端
```

### 终端 I/O

```
1. 客户端连接到 ws://localhost:7777/ws/terminal
2. 客户端发送: { type: "attach", terminalId: "abc123" }
3. 服务器附加到 dtach 会话
4. 服务器流式发送: { type: "output", terminalId: "abc123", data: "..." }
5. 客户端发送: { type: "input", terminalId: "abc123", data: "ls\n" }
6. 服务器写入 PTY
7. 服务器将输出流回
```

### 状态同步

```
1. Claude Code 插件检测到会话停止
2. 插件调用: vibora current-task review
3. CLI 发送 PATCH /api/tasks/:id/status
4. 服务器更新数据库
5. 如果关联了 Linear，服务器更新 Linear 工单
6. WebSocket 向所有客户端广播更新
7. UI 更新看板
```

## CLI 包

CLI 打包服务器以通过 npm 分发：

```
cli/
├── src/
│   └── index.ts         # CLI 入口点
├── server/
│   └── index.js         # 打包的服务器（生成）
├── dist/                # 前端构建（生成）
├── drizzle/             # SQL 迁移（生成）
└── lib/
    └── librust_pty.so   # 原生 PTY 库（生成）
```

使用 `mise run cli:build` 构建，CLI 是一个独立包，可在任何安装了 Bun 的地方运行。
