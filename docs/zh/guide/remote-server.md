# 远程服务器配置

在远程服务器上运行后端，随时随地连接。启动任务，合上笔记本电脑，代理继续工作。

## 为什么选择远程？

随着 AI 越来越能够自主工作，在远程服务器上运行代理变得至关重要：

- **持久化** — 断开连接后代理继续工作
- **资源** — 使用更强大的机器处理计算密集型任务
- **可用性** — 从任何地方访问工作空间
- **可靠性** — 即使笔记本电脑休眠，服务器也保持运行

## 桌面应用：SSH 端口转发

桌面应用连接到 `localhost:7777`。使用 SSH 端口转发隧道连接到远程服务器。

### 基本转发

```bash
# 将本地端口 7777 转发到远程服务器的端口 7777
ssh -L 7777:localhost:7777 your-server
```

### 后台运行并保活

```bash
ssh -fN -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -L 7777:localhost:7777 your-server
```

### 在远程服务器上

启动 Vibora：

```bash
npx vibora@latest up
```

桌面应用会自动通过隧道连接。

### 优势

- **安全** — 后端绑定到 localhost，无需暴露端口
- **高性能** — 直接 SSH 连接，延迟更低
- **简单** — 无需额外配置

### macOS 上的持久隧道

要创建重启后仍存在的隧道，创建 launchd 代理。请参阅 [此指南](https://gist.github.com/knowsuchagency/60656087903cd56d3a9b5d1d5c803186)。

## 浏览器：Tailscale 或 Cloudflare 隧道

对于纯浏览器访问，使用 Tailscale 或 Cloudflare 隧道暴露服务器。

### Tailscale

1. 在两台机器上安装 Tailscale
2. 在远程服务器上启动 Vibora：
   ```bash
   npx vibora@latest up
   ```
3. 通过浏览器访问：
   ```
   http://your-server.tailnet.ts.net:7777
   ```

### Cloudflare 隧道

使用 `cloudflared` 创建到 Vibora 服务器的隧道。这提供了带有 Cloudflare 安全功能的公开 URL。

## 作为服务运行

对于生产部署，将 Vibora 作为 systemd 服务运行。

### 用户服务

创建 `~/.config/systemd/user/vibora.service`：

```ini
[Unit]
Description=Vibora Server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h
ExecStart=/usr/local/bin/vibora up
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

启用并启动：

```bash
systemctl --user daemon-reload
systemctl --user enable vibora
systemctl --user start vibora
```

### 启用 Lingering

要在注销后保持服务运行：

```bash
sudo loginctl enable-linger $USER
```

## 配置

远程服务器通常需要自定义配置：

```bash
# 设置自定义端口
vibora config set server.port 8080

# 绑定到所有接口（如果使用 Tailscale）
# 注意：这会将服务器暴露在所有网络接口上
HOST=0.0.0.0 vibora up
```

请参阅 [配置](/zh/reference/configuration) 了解所有选项。
