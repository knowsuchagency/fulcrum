# 桌面应用

Vibora 桌面应用为 macOS 和 Linux 提供开箱即用的原生体验。

## 下载

| 平台 | 下载 |
|----------|----------|
| **macOS** (Apple Silicon) | [下载 DMG](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-macos-arm64.dmg) |
| **Linux** | [下载 AppImage](https://github.com/knowsuchagency/vibora/releases/latest/download/Vibora-linux-x64.AppImage) |

## 包含内容

桌面应用包含：

- **Vibora 服务器** — 无需单独安装
- **前端应用** — 原生窗口体验
- **Claude Code 插件** — 首次运行时自动安装
- **自动更新** — 有新版本时通知

## 安装

### macOS

1. 打开 DMG 文件
2. 将 Vibora 拖到应用程序文件夹
3. 首次启动时，macOS 会阻止应用（未经公证）
4. 打开 **系统设置 → 隐私与安全性**
5. 向下滚动，点击 **仍要打开**
6. 在对话框中确认点击 **仍要打开**

### Linux

1. 下载 AppImage
2. 设为可执行：
   ```bash
   chmod +x Vibora-*.AppImage
   ```
3. 运行：
   ```bash
   ./Vibora-*.AppImage
   ```

如需桌面集成，考虑使用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)。

## 功能

### 自动启动服务器

启动应用时，它会自动：

1. 检查内置服务器
2. 在端口 7777 启动服务器
3. 安装 Claude Code 插件
4. 打开主窗口

### 远程连接

桌面应用可以通过 SSH 端口转发连接到远程 Vibora 服务器：

```bash
ssh -L 7777:localhost:7777 your-server
```

应用连接到 `localhost:7777` 并通过隧道连接到远程服务器。详见 [远程服务器](/zh/guide/remote-server)。

### 更新通知

应用启动时检查更新，有新版本时通知您。更新从 GitHub Releases 下载。

## 故障排除

### macOS 安全阻止

如果 macOS 阻止应用：

1. 打开 **系统设置 → 隐私与安全性**
2. 找到底部附近的 Vibora 条目
3. 点击 **仍要打开**

### 服务器无法启动

检查端口 7777 是否已被占用：

```bash
lsof -i :7777
```

如果另一个 Vibora 实例正在运行，停止它：

```bash
vibora down
```

### 插件不工作

手动重新安装插件：

```bash
claude plugin install vibora@vibora --scope user
```

### 查看日志

日志存储在 `~/.vibora/`：

- `server.log` — 服务器标准输出/错误
- `vibora.log` — 应用日志（JSONL 格式）

查看最近错误：

```bash
grep '"lvl":"error"' ~/.vibora/vibora.log | tail -20
```
