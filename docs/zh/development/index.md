# 开发环境搭建

在本地搭建 Vibora 开发环境。

## 前提条件

- [mise](https://mise.jdx.dev/) 用于任务运行和工具管理
- [Bun](https://bun.sh/)（通过 mise 自动安装）

## 入门

```bash
# 克隆仓库
git clone https://github.com/knowsuchagency/vibora.git
cd vibora

# 安装工具和依赖
mise install

# 启动前端和后端
mise run dev
```

开发模式默认使用 `~/.vibora/dev`（端口 6666），以将开发数据与生产数据分开。

## 可用任务

```bash
mise run dev          # 启动前端和后端开发服务器
mise run server       # 启动带自动重载的后端开发服务器
mise run client       # 启动前端开发服务器
mise run build        # 构建生产版本
mise run start        # 运行生产服务器
mise run up           # 构建并启动生产服务器守护进程
mise run down         # 停止守护进程服务器
mise run check        # 运行所有检查（lint + 类型检查）
mise run lint         # 运行 ESLint
mise run typecheck    # 检查 TypeScript 类型
mise run preview      # 预览生产构建
```

### 数据库操作

数据库迁移在服务器启动时自动运行。要进行模式更改：

```bash
mise run db:generate  # 从模式更改生成新迁移
mise run db:migrate   # 应用待处理的迁移（服务器启动时也会执行）
mise run db:studio    # 打开 Drizzle Studio GUI
```

### CLI 包

```bash
mise run cli:build    # 打包服务器，复制前端，生成迁移
mise run cli:publish  # 发布到 npm（先运行 cli:build）
```

### 版本管理

```bash
mise run bump         # 递增补丁版本
mise run bump major   # 递增主版本
mise run bump minor   # 递增次版本
```

## 数据库

- 默认位置：`~/.vibora/vibora.db`（SQLite 使用 WAL 模式）
- Schema：`server/db/schema.ts`

### 数据表

| 表 | 描述 |
|-------|-------------|
| `tasks` | 任务元数据、git 工作树路径、状态、Linear 集成、PR 跟踪 |
| `repositories` | 保存的 git 仓库，包含启动脚本和复制文件模式 |
| `terminalTabs` | 终端组织的一级标签页实体 |
| `terminals` | 带有 dtach 会话支持的终端实例 |
| `terminalViewState` | 单例 UI 状态持久化（活跃标签页、聚焦的终端） |

任务状态：`IN_PROGRESS`、`IN_REVIEW`、`DONE`、`CANCELED`

## 开发者模式

开发者模式启用对 Vibora 开发有用的额外功能：

- **重启按钮** — 设置中出现"重启 Vibora"按钮
- **Vibora 实例标签页** — 监控中显示运行中的 Vibora 实例

通过 `VIBORA_DEVELOPER` 环境变量启用：

```bash
VIBORA_DEVELOPER=1 bun server/index.ts
```

## Systemd 用户服务

对于远程开发，将 Vibora 作为 systemd 用户服务运行。这允许从 Vibora 内部重启服务器。

创建 `~/.config/systemd/user/vibora.service`：

```ini
[Unit]
Description=Vibora Development Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/vibora
ExecStartPre=mise run build:debug
ExecStartPre=mise run down
ExecStart=bun server/index.ts
Environment=VIBORA_DEVELOPER=1
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

然后启用：

```bash
systemctl --user daemon-reload
systemctl --user enable vibora
systemctl --user start vibora
```

要在注销后保持服务运行：

```bash
loginctl enable-linger $USER
```
