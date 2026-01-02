# Linear 集成

Vibora 可以同步任务状态与 Linear 工单，保持项目管理与 AI 编程工作流同步。

## 配置

### 获取 Linear API 密钥

1. 进入 Linear **设置 → API**
2. 创建新的个人 API 密钥
3. 复制密钥

### 配置 Vibora

在 Vibora 中设置 API 密钥：

```bash
vibora config set integrations.linearApiKey YOUR_API_KEY
```

或使用环境变量：

```bash
export LINEAR_API_KEY=YOUR_API_KEY
```

## 关联任务

将 Vibora 任务关联到 Linear 工单：

```bash
vibora current-task linear https://linear.app/team/issue/TEAM-123
```

在任务工作树中运行此命令，将当前任务关联到指定的 Linear 工单。

## 自动状态同步

当 Vibora 中的任务状态改变时，关联的 Linear 工单会自动更新：

| Vibora 状态 | Linear 状态 |
|---------------|---------------|
| 进行中 | In Progress |
| 待审核 | In Review |
| 已完成 | Done |
| 已取消 | Canceled |

::: tip
确切的 Linear 状态名称可能因团队的工作流配置而异。Vibora 会映射到最接近的匹配状态。
:::

## 从 Linear 创建任务

您可以创建 Vibora 任务并立即关联到 Linear 工单：

1. 复制 Linear 工单 URL
2. 在 Vibora 中创建新任务
3. 在任务终端中运行 `vibora current-task linear <url>`

## 取消关联任务

移除 Linear 关联：

```bash
vibora current-task linear --unlink
```

## 故障排除

### 状态不同步

检查：
1. API 密钥是否正确配置
2. 您是否有权限更新该工单
3. Linear URL 是否有效

查看 API 错误日志：

```bash
grep '"src":"Linear"' ~/.vibora/vibora.log | tail -20
```

### 速率限制

Linear 有 API 速率限制。如果您快速进行多次状态更改，部分可能会延迟或失败。Vibora 会优雅地处理这种情况并重试。
