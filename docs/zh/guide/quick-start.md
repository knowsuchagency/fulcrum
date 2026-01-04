# 快速开始

一分钟内启动 Vibora。

## 安装

### 使用 npx（推荐）

```bash
npx vibora@latest up
```

Vibora 将会：
- 检查所需依赖项（bun、dtach、AI 代理 CLI、uv）
- 提示安装缺失的依赖
- 在 http://localhost:7777 启动服务器
- 显示入门提示

在浏览器中打开 [http://localhost:7777](http://localhost:7777)。

### 检查安装环境

```bash
vibora doctor
```

显示所有依赖项的状态和版本。

### 桌面应用

下载桌面应用获得开箱即用的体验：

| 平台 | 下载 |
|----------|----------|
| **macOS** (Apple Silicon) | [下载 DMG](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-macos-arm64.dmg) |
| **Linux** | [下载 AppImage](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-linux-x64.AppImage) |

桌面应用包含所有组件——只需安装即可运行。它会启动服务器、安装 Claude Code 插件，并自动检查更新。

::: details macOS 安装说明
1. 打开 DMG 并将 Vibora 拖到应用程序文件夹
2. 首次启动时，macOS 会阻止该应用
3. 打开 **系统设置 → 隐私与安全性**，向下滚动，点击 **仍要打开**
4. 在弹出对话框中确认点击 **仍要打开**
:::

### 安装脚本（推荐用于远程服务器）

用于自动化安装（适用于远程服务器）：

```bash
curl -fsSL https://raw.githubusercontent.com/knowsuchagency/vibora/main/install.sh | bash
```

安装脚本会安装 bun、dtach、uv、Claude Code、OpenCode、GitHub CLI、Docker、cloudflared 以及 vibora CLI + Claude Code 插件。

## 依赖项

### 必需

这些必须安装才能使 Vibora 正常工作：

| 依赖项 | 用途 |
|------------|---------|
| **git** | 版本控制（必须预先安装） |
| **bun** | JavaScript 运行时 |
| **dtach** | 终端会话持久化 |

### AI 代理（至少需要一个）

| 代理 | 描述 |
|-------|-------------|
| **Claude Code** | Anthropic 的 CLI 编程代理，深度 MCP 集成 |
| **OpenCode** | 开源编程代理，支持 GPT-4 及其他模型 |

在设置 > 代理中配置您首选的代理。

### 可选

这些启用额外功能：

| 依赖项 | 功能 |
|------------|---------|
| **uv** | Python 包管理器，用于基于 Python 的技能 |
| **gh** (GitHub CLI) | PR 创建和 GitHub 集成 |
| **Docker** | 使用 Docker Compose 部署应用 |
| **cloudflared** | Cloudflare 隧道，用于安全远程访问 |

检查您的安装环境：

```bash
vibora doctor
```

## 安装 Claude Code 插件

用于自动状态同步和任务管理：

```bash
claude plugin marketplace add knowsuchagency/vibora
claude plugin install vibora@vibora --scope user
```

插件功能：
- **自动状态同步** — Claude 停止时任务移至"待审核"，您回复时移回"进行中"
- **斜杠命令** — `/review`、`/pr`、`/notify`、`/linear`、`/task-info`
- **MCP 服务器** — Claude 可直接使用的任务管理工具

## 创建您的第一个任务

1. 进入 **仓库** 视图并添加一个仓库
2. 点击仓库上的 **新建任务**
3. 输入任务名称（例如"添加用户认证"）
4. Vibora 创建独立的 git 工作树并打开终端

![创建新任务](/screenshots/create-new-task-dialog.png)

您的任务现在运行在独立的工作树中。您可以：
- 在编辑器中打开
- 在终端中启动您的 AI 代理
- 在看板上跟踪进度

## 下一步

- [任务与工作树](/zh/guide/tasks) - 了解任务管理
- [远程服务器](/zh/guide/remote-server) - 在远程服务器上运行代理
- [Claude 插件](/zh/guide/claude-plugin) - 与 Claude Code 深度集成
