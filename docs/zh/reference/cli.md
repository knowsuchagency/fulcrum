# CLI 命令

Vibora CLI 让您可以从命令行管理服务器和任务。

## 服务器管理

### `vibora up`

启动 Vibora 服务器。

```bash
vibora up                  # 启动服务器守护进程
vibora up -y               # 自动安装启动（无提示）
```

### `vibora down`

停止服务器。

```bash
vibora down
```

### `vibora status`

检查服务器是否运行。

```bash
vibora status
```

### `vibora doctor`

检查所有依赖项及其版本。

```bash
vibora doctor
```

### `vibora health`

检查服务器健康状态。

```bash
vibora health
```

### `vibora mcp`

启动 MCP 服务器（用于 Claude Desktop 的 stdio 模式）。

```bash
vibora mcp
```

## 当前任务命令

这些命令作用于从当前工作目录检测到的任务。

### `vibora current-task`

获取当前任务信息。

```bash
vibora current-task              # 显示任务信息
vibora current-task in-progress  # 标记为进行中
vibora current-task review       # 标记为待审核
vibora current-task done         # 标记为已完成
vibora current-task cancel       # 标记为已取消
```

### `vibora current-task pr`

将拉取请求与当前任务关联。

```bash
vibora current-task pr <url>     # 关联 PR
vibora current-task pr --unlink  # 移除 PR 关联
```

### `vibora current-task linear`

关联 Linear 工单。

```bash
vibora current-task linear <url>     # 关联 Linear
vibora current-task linear --unlink  # 移除关联
```

## 任务管理

### `vibora tasks list`

列出所有任务。

```bash
vibora tasks list
vibora tasks list --status IN_PROGRESS
vibora tasks list --repo my-repo
```

### `vibora tasks get`

按 ID 获取任务。

```bash
vibora tasks get <id>
```

### `vibora tasks create`

创建新任务。

```bash
vibora tasks create
```

### `vibora tasks update`

更新任务。

```bash
vibora tasks update <id>
```

### `vibora tasks move`

将任务移动到不同状态。

```bash
vibora tasks move <id>
```

### `vibora tasks delete`

删除任务。

```bash
vibora tasks delete <id>
```

## Git 操作

### `vibora git status`

显示当前工作树的 git 状态。

```bash
vibora git status
```

### `vibora git diff`

显示当前工作树的 git 差异。

```bash
vibora git diff
```

### `vibora git branches`

列出仓库中的分支。

```bash
vibora git branches
```

## 工作树

### `vibora worktrees list`

列出所有工作树。

```bash
vibora worktrees list
```

### `vibora worktrees delete`

删除工作树。

```bash
vibora worktrees delete
```

## 配置

### `vibora config get`

获取配置值。

```bash
vibora config get <key>
vibora config get server.port
```

### `vibora config set`

设置配置值。

```bash
vibora config set <key> <value>
vibora config set server.port 8080
```

## 通知

### `vibora notifications`

显示通知设置。

```bash
vibora notifications
```

### `vibora notifications enable`

启用通知。

```bash
vibora notifications enable
```

### `vibora notifications disable`

禁用通知。

```bash
vibora notifications disable
```

### `vibora notifications test`

测试通知渠道。

```bash
vibora notifications test <channel>
```

### `vibora notify`

发送通知。

```bash
vibora notify <title> [message]
```

## 全局选项

这些选项适用于所有命令：

| 选项 | 描述 |
|--------|-------------|
| `--port=<port>` | 服务器端口（默认：7777） |
| `--url=<url>` | 覆盖完整服务器 URL |
| `--pretty` | 美化 JSON 输出 |
| `--json` | 强制 JSON 输出 |
