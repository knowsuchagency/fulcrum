# 终端内部原理

本文档介绍终端架构，包括 dtach 会话、WebSocket 协议和常见问题。

## 概述

Vibora 的终端系统有三层：

1. **前端** — xterm.js 终端模拟器 + MobX State Tree 状态管理
2. **WebSocket** — 前端和服务器之间的实时 I/O 多路复用
3. **后端** — bun-pty 进行 PTY 管理 + dtach 提供持久化

## dtach 会话生命周期

终端由 [dtach](https://github.com/crigler/dtach) 支持以实现持久化。理解其生命周期至关重要：

### 创建 (`dtach -n`)

```bash
dtach -n /path/to/socket /bin/bash
```

这会：
1. 在指定路径创建 Unix socket
2. 作为子进程生成 shell
3. **立即退出** — 创建进程是短暂的

### 附加 (`dtach -a`)

```bash
dtach -a /path/to/socket
```

这会：
1. 连接到现有 socket
2. 建立长期连接
3. 在 PTY 和附加的客户端之间转发 I/O

### 关键洞察

**创建和附加是独立的进程。** 创建进程立即退出——不要持有其引用并期望持续的 I/O。

## WebSocket 协议

终端 I/O 通过 `/ws/terminal` 的单个 WebSocket 连接多路复用。

### 消息类型

**客户端 → 服务器：**

```typescript
// 附加到终端
{ type: "attach", terminalId: string }

// 向终端发送输入
{ type: "input", terminalId: string, data: string }

// 调整终端大小
{ type: "resize", terminalId: string, cols: number, rows: number }

// 从终端分离
{ type: "detach", terminalId: string }
```

**服务器 → 客户端：**

```typescript
// 终端输出
{ type: "output", terminalId: string, data: string }

// 终端已创建
{ type: "terminal:created", terminal: Terminal }

// 终端已销毁
{ type: "terminal:destroyed", terminalId: string }

// 错误
{ type: "error", terminalId?: string, message: string }
```

### 连接流程

```
1. 客户端打开到 /ws/terminal 的 WebSocket
2. 客户端为每个可见终端发送 attach
3. 服务器附加到 dtach 会话
4. 服务器流式发送缓冲的输出
5. 持续的 I/O 双向流动
6. 断开连接时，服务器分离但会话保持
```

## MobX State Tree 模型

前端使用 MobX State Tree 管理终端状态：

```typescript
const Terminal = types.model("Terminal", {
  id: types.identifier,
  name: types.string,
  tabId: types.maybeNull(types.string),
  taskId: types.maybeNull(types.string),
  cwd: types.maybeNull(types.string),
  isAttached: types.optional(types.boolean, false),
})

const TerminalStore = types.model("TerminalStore", {
  terminals: types.map(Terminal),
  activeTerminalId: types.maybeNull(types.string),
})
```

### 乐观更新

创建终端时，我们使用临时 ID：

```typescript
// 1. 使用 tempId 创建
const tempId = `temp-${Date.now()}`
store.addTerminal({ id: tempId, name: "New Terminal" })

// 2. POST 到服务器
const response = await createTerminal({ name: "New Terminal" })

// 3. 用 realId 替换 tempId
store.replaceTerminalId(tempId, response.id)
```

## 缓冲区管理

服务器为每个终端维护输出缓冲区：

```typescript
class BufferManager {
  private buffers: Map<string, string[]> = new Map()
  private maxLines = 10000

  append(terminalId: string, data: string) {
    // 分行，维护最大缓冲区大小
  }

  getBuffer(terminalId: string): string {
    // 返回缓冲的输出以供附加时重放
  }
}
```

当客户端附加时，缓冲的输出会被重放以显示最近的历史记录。

## 常见问题

### 白屏竞态条件

**症状：** 终端显示白屏，尤其在桌面应用中。

**原因：** TerminalSession 中 `start()` 和 `attach()` 之间的竞态条件。

**根本原因：** `start()` 方法将短暂的 `dtach -n` PTY 存储在 `this.pty` 中。当 `attach()` 检查 `if (this.pty) return` 时，它会提前返回，认为附加已经完成。

**修复：** 在 `start()` 中使用局部变量存储创建 PTY。只有 `attach()` 应该设置 `this.pty`。

**教训：** 永远不要混淆创建进程和附加进程。

### 僵尸 dtach Socket

**症状：** "Socket already exists" 错误。

**原因：** 非正常关闭后留下的 dtach socket 文件。

**修复：** 检查并清理陈旧的 socket：

```typescript
if (fs.existsSync(socketPath)) {
  // 尝试连接——如果失败，socket 是陈旧的
  try {
    // 尝试连接
  } catch {
    fs.unlinkSync(socketPath)
  }
}
```

### 输出缓冲间隙

**症状：** 附加到终端时缺少输出。

**原因：** 如果未启用缓冲，服务器启动和客户端附加之间生成的输出可能丢失。

**修复：** 始终从 PTY 创建时就开始缓冲输出，而不是等到客户端附加。

## 调试

### 查看终端日志

```bash
grep '"src":"PTYManager"' ~/.vibora/vibora.log | tail -50
grep '"src":"TerminalSession"' ~/.vibora/vibora.log | tail -50
```

### 检查 dtach Socket

```bash
ls -la ~/.vibora/worktrees/*/sockets/
```

### 调试 WebSocket 消息

启用调试日志：

```bash
DEBUG=1 mise run dev
```

然后在浏览器控制台中查看 WebSocket 消息日志。
