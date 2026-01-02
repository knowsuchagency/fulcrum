# 应用部署

Vibora 包含完整的部署平台，用于在您自己的基础设施上运行应用。使用 Docker Compose 部署项目，支持自动域名路由、DNS 配置和实时构建日志。

## 为什么选择自托管部署？

**完全控制。** 您的代码运行在您的硬件上。无供应商锁定，无意外账单，无需担心数据存储位置。

- **开源** — 整个平台开源。可检查、修改和贡献代码。
- **您的基础设施** — 部署到任何您控制的服务器。$5/月的 VPS、专用服务器或家庭实验室。
- **完整生命周期** — 从隔离工作树开发到生产部署，一个工具完成。
- **Docker Compose** — 使用标准 Docker Compose 文件。无专有配置。

## 工作原理

1. **添加仓库**，包含 `docker-compose.yml` 文件
2. **从仓库创建应用**
3. **配置域名**，用于暴露服务
4. **部署** — Vibora 构建并运行容器

Vibora 使用 [Traefik](https://traefik.io/) 作为反向代理，根据域名将流量路由到容器。如果配置了 Cloudflare API 令牌，DNS 记录会自动创建。

## 前提条件

部署应用前，您需要：

- **Docker** — 在服务器上运行
- **Traefik** — Vibora 可以启动自己的 Traefik 容器，也可使用现有的（如 [Dokploy](https://dokploy.com/)）
- **域名** — 用于暴露服务（仅本地部署可选）
- **Cloudflare API 令牌** — 用于自动 DNS 配置或隧道访问（可选）

检查环境：

```bash
vibora doctor
```

## 创建应用

### 从界面

1. 在侧边栏进入 **应用**
2. 点击 **新建应用**
3. 选择仓库
4. 输入应用名称
5. 点击 **创建应用**

应用已创建但尚未部署。您会看到应用详情页，可在此配置域名和环境变量。

### 创建了什么

- **应用记录** — 存储在 Vibora 数据库中
- **服务** — 从 `docker-compose.yml` 解析
- **暂无容器** — 容器仅在部署时创建

## 配置服务

Compose 文件中的每个服务都会出现在应用设置中。对于每个服务，您可以配置：

### 域名

输入域名以将服务暴露到互联网：

```
myapp.example.com
```

要求：
- 服务必须在 Compose 文件中有端口映射（如 `ports: ["3000:3000"]`）

设置域名时，选择 **暴露方式**：
- **DNS** — 直接将流量路由到服务器（需要公网 IP）
- **隧道** — 通过 Cloudflare 路由（支持 NAT 后的服务器）

详见 [域名配置](#域名配置)。

### 端口映射

端口从 Compose 文件读取。如果服务没有端口映射，则无法暴露。

```yaml
# 在 docker-compose.yml 中
services:
  web:
    build: .
    ports:
      - "3000:3000"  # 暴露所需
```

编辑 Compose 文件以添加或修改端口映射。保存后更改会自动同步。

## 环境变量

设置构建和运行时可用的环境变量：

```
DATABASE_URL=postgres://user:pass@db:5432/myapp
API_KEY=your-secret-key
# 支持注释
```

环境变量：
- 在 `docker compose build` 期间可用
- 在容器运行时可用
- 加密存储在 Vibora 数据库中

## 部署

点击 **部署** 开始部署。您会看到实时进度：

1. **拉取** — 从仓库获取最新代码
2. **构建** — 运行 `docker compose build`
3. **启动** — 运行 `docker compose up`
4. **配置** — 设置 Traefik 路由和 DNS

### 构建选项

- **无缓存** — 强制全新构建，不使用 Docker 缓存
- **自动部署** — 当提交或合并到仓库默认分支时自动部署
- **通知** — 部署完成时收到通知

### 部署历史

查看最近 10 次部署的状态和构建日志。点击任意部署查看完整日志输出。

## 域名配置

Vibora 支持两种将服务暴露到互联网的方式：

### 暴露方式

配置服务域名时，可选择：

| 方式 | 工作原理 | 适用场景 |
|--------|--------------|----------|
| **DNS** | 创建指向服务器公网 IP 的 A 记录。流量直接到达服务器。 | 有公网 IP 的服务器，完全控制流量 |
| **隧道** | 创建 Cloudflare 隧道。流量通过 Cloudflare 网络路由，不暴露服务器 IP。 | 家庭实验室，NAT 后的服务器，增强安全性 |

### DNS 方式

使用 DNS 方式时：
1. 创建 A 记录将域名指向服务器 IP
2. 流量直接从互联网到达服务器
3. Traefik 处理路由和 HTTPS

要求：
- 服务器必须有公网 IP
- 端口 80/443 必须可访问

### 隧道方式

使用隧道方式时：
1. Vibora 为应用创建 Cloudflare 隧道
2. `cloudflared` 容器与应用一起运行
3. 流量通过 Cloudflare 网络路由到容器
4. CNAME 记录指向隧道

优势：
- **无需公网 IP** — 支持 NAT、防火墙或家庭网络
- **无需开放端口** — 服务器不需要开放 80/443 端口
- **DDoS 防护** — 流量经 Cloudflare 过滤
- **隐藏源 IP** — 服务器 IP 永不暴露

### Cloudflare 配置

要使用自动 DNS 或隧道，配置 Cloudflare 凭据：

1. 进入 **设置 > 部署**
2. 输入 **Cloudflare API 令牌**
3. 使用隧道时，还需输入 **Cloudflare 账户 ID**

#### API 令牌权限

创建具有以下权限的令牌：

| 范围 | 权限 | 访问级别 |
|-------|------------|--------|
| 账户 | Cloudflare Tunnel | 编辑 |
| 区域 | SSL 和证书 | 编辑 |
| 区域 | DNS | 编辑 |

创建令牌步骤：
1. 访问 [Cloudflare API 令牌](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **创建令牌**
3. 选择 **创建自定义令牌**
4. 添加上述三项权限
5. 将区域资源设置为您的域名（或选择"所有区域"以便使用）

账户 ID 可在 Cloudflare 仪表板 URL 或任何区域概览页面右侧边栏中找到。

### 手动 DNS

不使用 Cloudflare 集成时，手动创建 DNS 记录。将域名指向服务器公网 IP：

```
myapp.example.com.  A  203.0.113.42
```

### HTTPS 证书

Traefik 自动为 DNS 暴露的域名配置 Let's Encrypt 证书。隧道暴露的服务通过 Cloudflare 自动获得 HTTPS。

## 停止和删除

### 停止

点击 **停止** 停止所有容器但不删除应用。稍后可以重新部署。

### 删除

点击 **删除** 将：
- 停止所有容器
- 移除 Docker 堆栈
- 删除 Traefik 配置
- 从 Vibora 移除应用

仓库和源代码不受影响。

## 架构

### Docker Swarm

Vibora 使用 Docker Swarm 模式部署应用。这提供了：
- 服务编排
- 自动容器重启
- 滚动更新
- 网络隔离

每个应用作为 Docker 堆栈运行，拥有自己的 overlay 网络。

### Traefik 集成

Traefik 通过文件提供者配置。对于每个暴露的服务，Vibora 创建 YAML 配置文件：

```yaml
http:
  routers:
    myapp-web:
      rule: "Host(`myapp.example.com`)"
      service: myapp-web
      tls:
        certResolver: letsencrypt
  services:
    myapp-web:
      loadBalancer:
        servers:
          - url: "http://myapp_web:3000"
```

### 网络架构

```
互联网
    │
    ▼
Traefik（反向代理）
    │
    ├── myapp-network ──► myapp_web:3000
    │
    └── otherapp-network ──► otherapp_api:8080
```

每个应用有自己的 Docker 网络。Traefik 连接所有应用网络以路由流量。

## 故障排除

### 构建失败

检查部署日志中的错误信息。常见问题：
- Dockerfile 中缺少依赖
- Compose 语法无效

### 端口冲突

如果容器启动失败，显示"port already in use"或"bind: address already in use"：

1. **查找占用端口的进程：**
   ```bash
   sudo lsof -i :3000
   # 或
   sudo ss -tlnp | grep 3000
   ```

2. **常见冲突：**
   - 另一个应用使用相同主机端口部署
   - 直接在主机上运行的服务（Node 开发服务器、数据库等）
   - 之前未正常停止的部署

3. **解决方案：**
   - 更改 Compose 文件中的主机端口：使用 `"3001:3000"` 而非 `"3000:3000"`
   - 停止冲突的服务
   - 通过 Traefik 暴露时仅使用容器端口，不绑定主机端口（Traefik 通过 Docker 网络路由流量，无需主机端口）

**提示：** 通过 Traefik 暴露服务时，不需要主机端口映射。可以使用 `expose: ["3000"]` 替代 `ports: ["3000:3000"]`，仅将端口暴露给同一网络上的其他容器。

### 服务无法访问

1. 检查应用中是否配置了域名
2. 验证 DNS 指向服务器：`dig myapp.example.com`
3. 检查 Traefik 日志：`docker logs traefik`
4. 验证容器是否运行：`docker ps`

### DNS 未创建

- 验证设置中是否配置了 Cloudflare API 令牌
- 检查令牌是否有 **区域 → DNS → 编辑** 权限
- 查看部署日志中的错误

### 隧道无法工作

- 验证设置中是否配置了 API 令牌和账户 ID
- 检查令牌是否有 **账户 → Cloudflare Tunnel → 编辑** 权限
- 在 `docker ps` 中查找 `cloudflared` 容器
- 在 [Cloudflare Zero Trust 仪表板](https://one.dash.cloudflare.com/) 中检查隧道状态
