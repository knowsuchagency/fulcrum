# 配置

Vibora 通过配置文件和环境变量进行配置。

## z.ai 支持 <Badge type="tip" text="中国可用" />

::: tip 🇨🇳 中国用户友好
Vibora 内置 [z.ai](https://z.ai) 支持。在设置页面启用 z.ai，即可在中国大陆正常使用 Claude Code。

[了解更多 →](https://docs.z.ai/devpack/tool/claude)
:::

## 配置文件位置

配置存储在 `.vibora/settings.json`。vibora 目录按以下顺序解析：

1. `VIBORA_DIR` 环境变量（显式覆盖）
2. 当前工作目录中的 `.vibora`（工作树隔离）
3. `~/.vibora`（默认）

## 配置选项

### 服务器

| 设置 | 环境变量 | 默认值 | 描述 |
|---------|---------|---------|-------------|
| `server.port` | `PORT` | `7777` | 服务器端口 |

### 路径

| 设置 | 环境变量 | 默认值 | 描述 |
|---------|---------|---------|-------------|
| `paths.defaultGitReposDir` | `VIBORA_GIT_REPOS_DIR` | `~` | 仓库默认目录 |

### 编辑器

| 设置 | 环境变量 | 默认值 | 描述 |
|---------|---------|---------|-------------|
| `editor.sshPort` | `VIBORA_SSH_PORT` | `22` | 远程编辑器连接的 SSH 端口 |

### 集成

| 设置 | 环境变量 | 默认值 | 描述 |
|---------|---------|---------|-------------|
| `integrations.linearApiKey` | `LINEAR_API_KEY` | `null` | Linear API 密钥，用于工单同步 |
| `integrations.githubPat` | `GITHUB_PAT` | `null` | GitHub PAT，用于私有仓库 |

### 外观

| 设置 | 环境变量 | 默认值 | 描述 |
|---------|---------|---------|-------------|
| `appearance.language` | — | `null` | 界面语言（null 时自动检测） |

### 通知

通知设置通过设置界面或 CLI 配置：

| 设置 | 描述 |
|---------|-------------|
| `notifications.sound.enabled` | 启用声音通知 |
| `notifications.slack.enabled` | 启用 Slack 通知 |
| `notifications.slack.webhookUrl` | Slack webhook URL |
| `notifications.discord.enabled` | 启用 Discord 通知 |
| `notifications.discord.webhookUrl` | Discord webhook URL |
| `notifications.pushover.enabled` | 启用 Pushover 通知 |
| `notifications.pushover.userKey` | Pushover 用户密钥 |
| `notifications.pushover.appToken` | Pushover 应用令牌 |

## 优先级

配置值按以下顺序解析（从高到低）：

1. 环境变量
2. `settings.json` 中的值
3. 默认值

## CLI 配置

### 获取值

```bash
vibora config get server.port
vibora config get integrations.linearApiKey
```

### 设置值

```bash
vibora config set server.port 8080
vibora config set integrations.linearApiKey YOUR_KEY
```

## 数据库

SQLite 数据库存储在 `{viboraDir}/vibora.db`。此位置由 vibora 目录派生，不可单独配置。

数据库使用 WAL 模式以获得更好的并发访问性能。

## 工作树

工作树存储在 `{viboraDir}/worktrees/`。此位置由 vibora 目录派生，不可单独配置。

## 日志

| 日志文件 | 描述 |
|----------|-------------|
| `{viboraDir}/server.log` | 服务器标准输出/错误（守护进程模式） |
| `{viboraDir}/vibora.log` | 应用日志（JSONL 格式） |

### 日志级别

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | 后端最低日志级别 |
| `VITE_LOG_LEVEL` | `info` | 前端最低日志级别 |
| `DEBUG` | `0` | 启用前端调试日志 |

可用级别：`debug`、`info`、`warn`、`error`

## 示例 settings.json

```json
{
  "server": {
    "port": 7777
  },
  "paths": {
    "defaultGitReposDir": "/home/user/projects"
  },
  "editor": {
    "sshPort": 22
  },
  "integrations": {
    "linearApiKey": null,
    "githubPat": null
  },
  "appearance": {
    "language": null
  },
  "notifications": {
    "sound": {
      "enabled": true
    }
  }
}
```
