# Claude Code 插件

Vibora 的 Claude Code 插件实现了 AI 编程会话与任务管理之间的深度集成。

## 安装

```bash
claude plugin marketplace add knowsuchagency/vibora
claude plugin install vibora@vibora --scope user
```

使用桌面应用时，插件会自动安装。

## 功能

### 自动状态同步

在任务工作树中工作时：

- **Claude 停止并等待输入** → 任务移至"待审核"
- **您回复 Claude** → 任务移至"进行中"

这一切自动发生——无需手动更新状态。

### 斜杠命令

插件提供多个斜杠命令：

| 命令 | 描述 |
|---------|-------------|
| `/review` | 将当前任务标记为待审核 |
| `/pr` | 将 PR 与当前任务关联 |
| `/notify` | 发送通知 |
| `/linear` | 关联 Linear 工单 |
| `/task-info` | 显示当前任务详情 |

### 会话连续性

Claude 会话与任务 ID 绑定。当您返回任务时，Claude 拥有之前会话的上下文。

### Vibora 技能

插件包含一个技能，为 Claude 提供任务管理的 CLI 文档。Claude 可以使用它来了解如何与 Vibora 交互。

## MCP 服务器

插件包含一个 MCP 服务器，直接向 Claude 暴露任务管理和远程执行工具。

### 任务管理工具

| 工具 | 描述 |
|------|-------------|
| `list_tasks` | 列出所有任务，支持状态/仓库过滤 |
| `get_task` | 按 ID 获取任务详情 |
| `create_task` | 创建带有 git 工作树的新任务 |
| `update_task` | 更新任务标题/描述 |
| `delete_task` | 删除任务 |
| `move_task` | 更改任务状态 |
| `list_repositories` | 列出已配置的仓库 |
| `send_notification` | 向已启用的渠道发送通知 |

### 远程命令执行

| 工具 | 描述 |
|------|-------------|
| `execute_command` | 在 Vibora 服务器上执行 shell 命令 |
| `list_exec_sessions` | 列出活跃的命令执行会话 |
| `update_exec_session` | 重命名会话 |
| `destroy_exec_session` | 清理会话 |

`execute_command` 工具支持持久会话，环境变量、工作目录和 shell 状态在命令之间保持。

### 与 Claude Desktop 使用

添加到 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "vibora": {
      "command": "vibora",
      "args": ["mcp"]
    }
  }
}
```

## 工作原理

插件通过检查当前目录与已知工作树路径来检测您是否在任务工作树中。然后它会：

1. **识别当前任务** — 从工作树路径
2. **注册钩子** — 用于会话事件（停止、恢复）
3. **更新任务状态** — 通过 Vibora API
4. **暴露 MCP 工具** — 供 Claude 使用

## 手动插件开发

插件源代码在 Vibora 仓库的 `plugins/vibora/` 中。关键文件：

```
plugins/vibora/
├── .claude-plugin/
│   └── plugin.json      # 插件清单
├── skills/
│   └── vibora.md        # CLI 文档技能
└── hooks/
    └── *.sh             # 事件钩子
```
