# MCP 工具

Vibora 插件包含一个 MCP 服务器，向 Claude 暴露任务管理和远程执行工具。

## 配置

### Claude Code

使用 Vibora 插件时，MCP 服务器自动可用。

### Claude Desktop

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

## 任务管理工具

### `list_tasks`

列出所有任务，支持可选过滤。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `status` | string | 按状态过滤（IN_PROGRESS、IN_REVIEW、DONE、CANCELED） |
| `repository` | string | 按仓库名称过滤 |

**示例：**
```json
{
  "status": "IN_PROGRESS"
}
```

### `get_task`

获取特定任务的详情。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `id` | string | 任务 ID（必需） |

### `create_task`

创建带有 git 工作树的新任务。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `title` | string | 任务标题（必需） |
| `description` | string | 任务描述 |
| `repositoryId` | string | 仓库 ID（必需） |
| `baseBranch` | string | 创建工作树的分支 |

### `update_task`

更新任务的标题或描述。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `id` | string | 任务 ID（必需） |
| `title` | string | 新标题 |
| `description` | string | 新描述 |

### `delete_task`

删除任务及其工作树。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `id` | string | 任务 ID（必需） |

### `move_task`

更改任务状态。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `id` | string | 任务 ID（必需） |
| `status` | string | 新状态（IN_PROGRESS、IN_REVIEW、DONE、CANCELED） |

### `list_repositories`

列出所有已配置的仓库。

**参数：** 无

### `send_notification`

向已启用的渠道发送通知。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `title` | string | 通知标题（必需） |
| `message` | string | 通知消息 |

## 远程执行工具

### `execute_command`

在 Vibora 服务器上执行 shell 命令。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `command` | string | 要执行的命令（必需） |
| `sessionId` | string | 会话 ID，用于持久化环境 |
| `sessionName` | string | 人类可读的会话名称 |
| `cwd` | string | 工作目录 |

**特性：**
- 持久会话，保留环境
- 工作目录在命令之间保持
- Shell 状态（别名、函数）保留

**示例：**
```json
{
  "command": "cd /project && npm install",
  "sessionId": "my-session",
  "sessionName": "项目设置"
}
```

### `list_exec_sessions`

列出活跃的命令执行会话。

**参数：** 无

**返回：**
- 会话 ID
- 会话名称
- 工作目录
- 创建时间戳

### `update_exec_session`

重命名会话。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `sessionId` | string | 会话 ID（必需） |
| `sessionName` | string | 新名称（必需） |

### `destroy_exec_session`

清理会话。

**参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `sessionId` | string | 会话 ID（必需） |

## 使用示例

Claude 可以使用这些工具自主管理任务：

```
我将创建一个新任务来实现认证功能。

[使用 create_task，标题为"添加用户认证"，repositoryId 为"abc123"]

任务已创建。让我检查所有任务的当前状态。

[使用 list_tasks，状态为"IN_PROGRESS"]

我看到有 3 个进行中的任务。我将更新认证任务的描述。

[使用 update_task，带有 id 和新描述]
```

## 错误处理

所有工具以一致格式返回错误：

```json
{
  "error": "任务未找到",
  "code": "NOT_FOUND"
}
```

常见错误代码：
- `NOT_FOUND` — 资源不存在
- `INVALID_INPUT` — 无效参数
- `PERMISSION_DENIED` — 操作不允许
- `SERVER_ERROR` — 内部错误
