# REST API

Vibora exposes a REST API for programmatic access to task management and server features.

## Base URL

```
http://localhost:7777/api
```

## Authentication

The API currently does not require authentication. When running on a remote server, secure access via SSH tunneling or reverse proxy.

## Tasks

### List Tasks

```http
GET /api/tasks
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `status` | string | Filter by status |
| `repositoryId` | string | Filter by repository |

**Response:**
```json
[
  {
    "id": "abc123",
    "title": "Add authentication",
    "status": "IN_PROGRESS",
    "repositoryId": "repo456",
    "worktreePath": "/home/user/.vibora/worktrees/task-abc123",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T14:20:00Z"
  }
]
```

### Get Task

```http
GET /api/tasks/:id
```

**Response:**
```json
{
  "id": "abc123",
  "title": "Add authentication",
  "description": "Implement user login and registration",
  "status": "IN_PROGRESS",
  "repositoryId": "repo456",
  "worktreePath": "/home/user/.vibora/worktrees/task-abc123",
  "prUrl": "https://github.com/org/repo/pull/42",
  "linearUrl": "https://linear.app/team/issue/TEAM-123",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:20:00Z"
}
```

### Create Task

```http
POST /api/tasks
```

**Body:**
```json
{
  "title": "Add authentication",
  "description": "Implement user login",
  "repositoryId": "repo456",
  "baseBranch": "main"
}
```

### Update Task

```http
PATCH /api/tasks/:id
```

**Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description"
}
```

### Update Task Status

```http
PATCH /api/tasks/:id/status
```

**Body:**
```json
{
  "status": "IN_REVIEW"
}
```

### Delete Task

```http
DELETE /api/tasks/:id
```

## Repositories

### List Repositories

```http
GET /api/repositories
```

**Response:**
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

### Get Repository

```http
GET /api/repositories/:id
```

### Create Repository

```http
POST /api/repositories
```

**Body:**
```json
{
  "path": "/home/user/projects/my-project"
}
```

### Delete Repository

```http
DELETE /api/repositories/:id
```

## Apps

### List Apps

```http
GET /api/apps
```

**Response:**
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

### Get App

```http
GET /api/apps/:id
```

### Create App

```http
POST /api/apps
```

**Body:**
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

### Update App

```http
PATCH /api/apps/:id
```

**Body:**
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

### Delete App

```http
DELETE /api/apps/:id
```

Stops all containers and removes the Docker stack.

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `stopContainers` | boolean | Whether to stop containers (default: true) |

### Deploy App

```http
POST /api/apps/:id/deploy
```

Triggers a deployment. Returns immediately; check deployments for status.

**Response:**
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

### Deploy App (Streaming)

```http
GET /api/apps/:id/deploy/stream
```

Server-Sent Events endpoint for real-time deployment progress.

**Events:**
- `progress` — Build progress updates
- `complete` — Deployment finished successfully
- `error` — Deployment failed

### Stop App

```http
POST /api/apps/:id/stop
```

Stops all containers without deleting the app.

### Cancel Deployment

```http
POST /api/apps/:id/cancel-deploy
```

Cancels an in-progress deployment.

### Get App Logs

```http
GET /api/apps/:id/logs
```

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `service` | string | Filter by service name |
| `tail` | number | Number of lines (default: 100) |

### Get App Status

```http
GET /api/apps/:id/status
```

**Response:**
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

### Get Deployments

```http
GET /api/apps/:id/deployments
```

Returns the last 10 deployments for the app.

### Sync Services

```http
POST /api/apps/:id/sync-services
```

Re-parses the compose file and updates service ports.

## Deployment Settings

### Get Prerequisites

```http
GET /api/deployment/prerequisites
```

Check if Docker, Traefik, and other prerequisites are configured.

**Response:**
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

### Get Deployment Settings

```http
GET /api/deployment/settings
```

### Update Deployment Settings

```http
POST /api/deployment/settings
```

**Body:**
```json
{
  "cloudflareApiToken": "your-token"
}
```

### Start Traefik

```http
POST /api/deployment/traefik/start
```

Starts Vibora's managed Traefik container.

### Stop Traefik

```http
POST /api/deployment/traefik/stop
```

## Terminals

### List Terminals

```http
GET /api/terminals
```

### Create Terminal

```http
POST /api/terminals
```

**Body:**
```json
{
  "name": "My Terminal",
  "cwd": "/home/user/projects"
}
```

### Delete Terminal

```http
DELETE /api/terminals/:id
```

## Worktrees

### List Worktrees

```http
GET /api/worktrees
```

### Delete Worktree

```http
DELETE /api/worktrees/:path
```

## Git Operations

### Repository Status

```http
GET /api/git/status?path=/path/to/repo
```

### Repository Diff

```http
GET /api/git/diff?path=/path/to/repo
```

### List Branches

```http
GET /api/git/branches?path=/path/to/repo
```

## Notifications

### Send Notification

```http
POST /api/notifications
```

**Body:**
```json
{
  "title": "Task Complete",
  "message": "Authentication feature is ready for review"
}
```

## Health

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

## WebSocket

Terminal I/O is handled via WebSocket:

```
ws://localhost:7777/ws/terminal
```

### Protocol

Messages are JSON-encoded:

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

## Error Responses

Errors return appropriate HTTP status codes with a JSON body:

```json
{
  "error": "Task not found",
  "code": "NOT_FOUND"
}
```

| Status | Description |
|--------|-------------|
| 400 | Bad Request — Invalid input |
| 404 | Not Found — Resource doesn't exist |
| 500 | Internal Server Error |
