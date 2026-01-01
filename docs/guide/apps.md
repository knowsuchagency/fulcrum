# App Deployment

Vibora includes a complete deployment platform for running your applications on your own infrastructure. Deploy Docker Compose projects with automatic domain routing, DNS configuration, and real-time build logs.

## Why Self-Hosted Deployment?

**Full control.** Your code runs on your hardware. No vendor lock-in, no surprise bills, no wondering where your data lives.

- **Open source** — The entire platform is open source. Inspect, modify, and contribute.
- **Your infrastructure** — Deploy to any server you control. A $5/month VPS, a dedicated server, or your home lab.
- **Complete lifecycle** — From development in isolated worktrees to production deployment, all from one tool.
- **Docker Compose** — Use standard Docker Compose files. No proprietary configuration.

## How It Works

1. **Add a repository** with a `docker-compose.yml` file
2. **Create an app** from the repository
3. **Configure domains** for services you want to expose
4. **Deploy** — Vibora builds and runs your containers

Vibora uses [Traefik](https://traefik.io/) as a reverse proxy to route traffic to your containers based on domain names. If you have a Cloudflare API token configured, DNS records are created automatically.

## Prerequisites

Before deploying apps, you need:

- **Docker** — Running on your server
- **Traefik** — Vibora can start its own Traefik container, or use an existing one (e.g., from [Dokploy](https://dokploy.com/))
- **A domain** — For exposing services (optional for local-only deployments)
- **Cloudflare API token** — For automatic DNS configuration (optional)

Check your setup:

```bash
vibora doctor
```

## Creating an App

### From the UI

1. Navigate to **Apps** in the sidebar
2. Click **New App**
3. Select a repository
4. Enter an app name
5. Click **Create App**

The app is created but not yet deployed. You'll see the app's detail page where you can configure domains and environment variables.

### What Gets Created

- **App record** — Stored in Vibora's database
- **Services** — Parsed from your `docker-compose.yml`
- **No containers yet** — Containers are only created when you deploy

## Configuring Services

Each service from your Compose file appears in the app's settings. For each service, you can configure:

### Domain

Enter a domain to expose the service to the internet:

```
myapp.example.com
```

Requirements:
- The service must have a port mapping in the Compose file (e.g., `ports: ["3000:3000"]`)
- The domain must point to your server's IP (manual or via Cloudflare integration)

When a domain is set, Vibora:
1. Creates a Traefik configuration for the domain
2. Optionally creates a Cloudflare DNS record
3. Provisions an HTTPS certificate via Let's Encrypt (or Cloudflare Origin CA)

### Port Mapping

Ports are read from your Compose file. If a service doesn't have a port mapping, you cannot expose it.

```yaml
# In your docker-compose.yml
services:
  web:
    build: .
    ports:
      - "3000:3000"  # Required for exposure
```

Edit your Compose file to add or modify port mappings. Changes sync automatically when you save.

## Environment Variables

Set environment variables that are available during build and runtime:

```
DATABASE_URL=postgres://user:pass@db:5432/myapp
API_KEY=your-secret-key
# Comments are supported
```

Environment variables are:
- Available during `docker compose build`
- Available inside your containers at runtime
- Stored encrypted in Vibora's database

## Deploying

Click **Deploy** to start a deployment. You'll see real-time progress:

1. **Pulling** — Fetches latest code from the repository
2. **Building** — Runs `docker compose build`
3. **Starting** — Runs `docker compose up`
4. **Configuring** — Sets up Traefik routing and DNS

### Build Options

- **No-cache** — Force a fresh build without Docker cache
- **Autodeploy** — Automatically deploy when the repository receives a push (coming soon)
- **Notifications** — Get notified when deployments complete

### Deployment History

View the last 10 deployments with their status and build logs. Click any deployment to see the full log output.

## Domain Configuration

### Automatic DNS (Cloudflare)

If you configure a Cloudflare API token:

1. Go to **Settings > Deployment**
2. Enter your Cloudflare API token
3. DNS records are created automatically when you deploy

The token needs the following permissions:
- `Zone:DNS:Edit` for the zones you're deploying to

### Manual DNS

Without Cloudflare integration, you'll see a reminder to create DNS records manually. Point your domain to your server's public IP with an A record:

```
myapp.example.com.  A  203.0.113.42
```

### HTTPS Certificates

Traefik automatically provisions Let's Encrypt certificates for your domains. If you're using Cloudflare with proxying enabled, Vibora can generate Cloudflare Origin CA certificates instead.

## Stopping and Deleting

### Stop

Click **Stop** to stop all containers without deleting the app. You can deploy again later.

### Delete

Click **Delete** to:
- Stop all containers
- Remove the Docker stack
- Delete Traefik configuration
- Remove the app from Vibora

The repository and source code are not affected.

## Architecture

### Docker Swarm

Vibora deploys apps using Docker Swarm mode. This provides:
- Service orchestration
- Automatic container restart
- Rolling updates
- Network isolation

Each app runs as a Docker stack with its own overlay network.

### Traefik Integration

Traefik is configured via file providers. For each exposed service, Vibora creates a YAML configuration file:

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

### Network Architecture

```
Internet
    │
    ▼
Traefik (reverse proxy)
    │
    ├── myapp-network ──► myapp_web:3000
    │
    └── otherapp-network ──► otherapp_api:8080
```

Each app gets its own Docker network. Traefik connects to all app networks to route traffic.

## Troubleshooting

### Build Fails

Check the deployment logs for error messages. Common issues:
- Missing dependencies in Dockerfile
- Invalid Compose syntax
- Port conflicts

### Service Not Accessible

1. Check that the domain is configured in the app
2. Verify DNS points to your server: `dig myapp.example.com`
3. Check Traefik logs: `docker logs traefik`
4. Verify the container is running: `docker ps`

### DNS Not Created

- Verify your Cloudflare API token is set in Settings
- Check that the token has `Zone:DNS:Edit` permission
- Look for errors in the deployment log

## Best Practices

### Use Environment Variables

Never hardcode secrets in your Compose file. Use environment variables:

```yaml
services:
  web:
    environment:
      - DATABASE_URL
      - API_KEY
```

Then set `DATABASE_URL` and `API_KEY` in the app's environment settings.

### Health Checks

Add health checks to your Compose file for better container management:

```yaml
services:
  web:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Resource Limits

Set memory and CPU limits to prevent runaway containers:

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```
