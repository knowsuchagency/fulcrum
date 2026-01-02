# REST API

Vibora 提供 REST API 用于程序化访问任务管理和服务器功能。

## 基础 URL

```
http://localhost:7777/api
```

## 认证

API 目前不需要认证。在远程服务器上运行时，通过 SSH 隧道或反向代理保护访问。

## 任务

### 列出任务

```http
GET /api/tasks
```

**查询参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `status` | string | 按状态过滤 |
| `repositoryId` | string | 按仓库过滤 |

**响应：**
```json
[
  {
    "id": "abc123",
    "title": "添加认证",
    "status": "IN_PROGRESS",
    "repositoryId": "repo456",
    "worktreePath": "/home/user/.vibora/worktrees/task-abc123",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T14:20:00Z"
  }
]
```

### 获取任务

```http
GET /api/tasks/:id
```

**响应：**
```json
{
  "id": "abc123",
  "title": "添加认证",
  "description": "实现用户登录和注册",
  "status": "IN_PROGRESS",
  "repositoryId": "repo456",
  "worktreePath": "/home/user/.vibora/worktrees/task-abc123",
  "prUrl": "https://github.com/org/repo/pull/42",
  "linearUrl": "https://linear.app/team/issue/TEAM-123",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:20:00Z"
}
```

### 创建任务

```http
POST /api/tasks
```

**请求体：**
```json
{
  "title": "添加认证",
  "description": "实现用户登录",
  "repositoryId": "repo456",
  "baseBranch": "main"
}
```

### 更新任务

```http
PATCH /api/tasks/:id
```

**请求体：**
```json
{
  "title": "更新后的标题",
  "description": "更新后的描述"
}
```

### 更新任务状态

```http
PATCH /api/tasks/:id/status
```

**请求体：**
```json
{
  "status": "IN_REVIEW"
}
```

### 删除任务

```http
DELETE /api/tasks/:id
```

## 仓库

### 列出仓库

```http
GET /api/repositories
```

**响应：**
```json
[
  {
    "id": "repo456",
    "name": "my-project",
    "path": "/home/user/projects/my-project",
    "defaultBranch": "main"
  }
]
```

### 获取仓库

```http
GET /api/repositories/:id
```

### 创建仓库

```http
POST /api/repositories
```

**请求体：**
```json
{
  "path": "/home/user/projects/my-project"
}
```

### 删除仓库

```http
DELETE /api/repositories/:id
```

## 应用

### 列出应用

```http
GET /api/apps
```

**响应：**
```json
[
  {
    "id": "app123",
    "name": "my-app",
    "repositoryId": "repo456",
    "status": "running",
    "composeFile": "docker-compose.yml",
    "autoDeployEnabled": false,
    "services": [
      {
        "serviceName": "web",
        "containerPort": 3000,
        "exposed": true,
        "domain": "myapp.example.com"
      }
    ]
  }
]
```

### 获取应用

```http
GET /api/apps/:id
```

### 创建应用

```http
POST /api/apps
```

**请求体：**
```json
{
  "name": "my-app",
  "repositoryId": "repo456",
  "branch": "main",
  "composeFile": "docker-compose.yml",
  "services": [
    {
      "serviceName": "web",
      "containerPort": 3000,
      "exposed": true,
      "domain": "myapp.example.com"
    }
  ]
}
```

### 更新应用

```http
PATCH /api/apps/:id
```

**请求体：**
```json
{
  "name": "updated-name",
  "autoDeployEnabled": true,
  "notificationsEnabled": true,
  "environmentVariables": {
    "DATABASE_URL": "postgres://..."
  },
  "services": [
    {
      "serviceName": "web",
      "containerPort": 3000,
      "exposed": true,
      "domain": "myapp.example.com"
    }
  ]
}
```

### 删除应用

```http
DELETE /api/apps/:id
```

停止所有容器并移除 Docker 堆栈。

**查询参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `stopContainers` | boolean | 是否停止容器（默认：true） |

### 部署应用

```http
POST /api/apps/:id/deploy
```

触发部署。立即返回；通过部署 API 检查状态。

**响应：**
```json
{
  "success": true,
  "deployment": {
    "id": "deploy123",
    "status": "building",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### 部署应用（流式）

```http
GET /api/apps/:id/deploy/stream
```

Server-Sent Events 端点，用于实时部署进度。

**事件：**
- `progress` — 构建进度更新
- `complete` — 部署成功完成
- `error` — 部署失败

### 停止应用

```http
POST /api/apps/:id/stop
```

停止所有容器但不删除应用。

### 取消部署

```http
POST /api/apps/:id/cancel-deploy
```

取消进行中的部署。

### 获取应用日志

```http
GET /api/apps/:id/logs
```

**查询参数：**
| 名称 | 类型 | 描述 |
|------|------|-------------|
| `service` | string | 按服务名称过滤 |
| `tail` | number | 行数（默认：100） |

### 获取应用状态

```http
GET /api/apps/:id/status
```

**响应：**
```json
{
  "containers": [
    {
      "name": "myapp_web.1",
      "status": "running",
      "state": "Running"
    }
  ]
}
```

### 获取部署历史

```http
GET /api/apps/:id/deployments
```

返回应用最近 10 次部署。

### 同步服务

```http
POST /api/apps/:id/sync-services
```

重新解析 compose 文件并更新服务端口。

## 部署设置

### 获取前提条件

```http
GET /api/deployment/prerequisites
```

检查 Docker、Traefik 和其他前提条件是否已配置。

**响应：**
```json
{
  "docker": {
    "installed": true,
    "running": true,
    "version": "24.0.7"
  },
  "traefik": {
    "detected": true,
    "type": "vibora",
    "containerName": "traefik",
    "network": "traefik"
  },
  "settings": {
    "cloudflareConfigured": true
  },
  "ready": true
}
```

### 获取部署设置

```http
GET /api/deployment/settings
```

### 更新部署设置

```http
POST /api/deployment/settings
```

**请求体：**
```json
{
  "cloudflareApiToken": "your-token"
}
```

### 启动 Traefik

```http
POST /api/deployment/traefik/start
```

启动 Vibora 管理的 Traefik 容器。

### 停止 Traefik

```http
POST /api/deployment/traefik/stop
```

## 终端

### 列出终端

```http
GET /api/terminals
```

### 创建终端

```http
POST /api/terminals
```

**请求体：**
```json
{
  "name": "我的终端",
  "cwd": "/home/user/projects"
}
```

### 删除终端

```http
DELETE /api/terminals/:id
```

## 工作树

### 列出工作树

```http
GET /api/worktrees
```

### 删除工作树

```http
DELETE /api/worktrees/:path
```

## Git 操作

### 仓库状态

```http
GET /api/git/status?path=/path/to/repo
```

### 仓库差异

```http
GET /api/git/diff?path=/path/to/repo
```

### 列出分支

```http
GET /api/git/branches?path=/path/to/repo
```

## 通知

### 发送通知

```http
POST /api/notifications
```

**请求体：**
```json
{
  "title": "任务完成",
  "message": "认证功能已准备好审核"
}
```

## 健康检查

### 健康检查

```http
GET /api/health
```

**响应：**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

## WebSocket

终端 I/O 通过 WebSocket 处理：

```
ws://localhost:7777/ws/terminal
```

### 协议

消息使用 JSON 编码：

```json
{
  "type": "input",
  "terminalId": "term123",
  "data": "ls -la\n"
}
```

```json
{
  "type": "output",
  "terminalId": "term123",
  "data": "total 48\ndrwxr-xr-x..."
}
```

## 错误响应

错误返回适当的 HTTP 状态码和 JSON 体：

```json
{
  "error": "任务未找到",
  "code": "NOT_FOUND"
}
```

| 状态码 | 描述 |
|--------|-------------|
| 400 | 错误请求 — 无效输入 |
| 404 | 未找到 — 资源不存在 |
| 500 | 内部服务器错误 |
