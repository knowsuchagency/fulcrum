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
- **Cloudflare API token** — For automatic DNS configuration or tunnel access (optional)

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

When setting a domain, choose an **exposure method**:
- **DNS** — Direct traffic to your server (requires public IP)
- **Tunnel** — Route through Cloudflare (works behind NAT)

See [Domain Configuration](#domain-configuration) for details on each method.

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
- **Autodeploy** — Automatically deploy when commits or merges land on the repository's default branch
- **Notifications** — Get notified when deployments complete

### Deployment History

View the last 10 deployments with their status and build logs. Click any deployment to see the full log output.

## Domain Configuration

Vibora supports two methods for exposing services to the internet:

### Exposure Methods

When configuring a domain for a service, you can choose between:

| Method | How it works | Best for |
|--------|--------------|----------|
| **DNS** | Creates an A record pointing to your server's public IP. Traffic goes directly to your server. | Servers with public IPs, full control over traffic |
| **Tunnel** | Creates a Cloudflare Tunnel. Traffic routes through Cloudflare's network without exposing your server's IP. | Home labs, servers behind NAT, enhanced security |

### DNS Method

With the DNS method:
1. An A record is created pointing your domain to your server's IP
2. Traffic flows directly from the internet to your server
3. Traefik handles routing and HTTPS

Requirements:
- Your server must have a public IP address
- Port 80/443 must be accessible

### Tunnel Method

With the Tunnel method:
1. Vibora creates a Cloudflare Tunnel for your app
2. A `cloudflared` container runs alongside your app
3. Traffic routes through Cloudflare's network to your containers
4. A CNAME record points to the tunnel

Benefits:
- **No public IP required** — Works behind NAT, firewalls, or on home networks
- **No exposed ports** — Your server doesn't need ports 80/443 open
- **DDoS protection** — Traffic is filtered by Cloudflare
- **Hidden origin IP** — Your server's IP is never exposed

### Cloudflare Setup

To use automatic DNS or tunnels, configure your Cloudflare credentials:

1. Go to **Settings > Deployment**
2. Enter your **Cloudflare API token**
3. For tunnels, also enter your **Cloudflare Account ID**

#### API Token Permissions

Create a token with these permissions:

| Scope | Permission | Access |
|-------|------------|--------|
| Account | Cloudflare Tunnel | Edit |
| Zone | SSL and Certificates | Edit |
| Zone | DNS | Edit |

To create a token:
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Create Custom Token**
4. Add the three permissions listed above
5. Set zone resources to your domain (or "All zones" for convenience)

Your Account ID is visible in the Cloudflare dashboard URL or on the right sidebar of any zone's overview page.

### Manual DNS

Without Cloudflare integration, create DNS records manually. Point your domain to your server's public IP:

```
myapp.example.com.  A  203.0.113.42
```

### HTTPS Certificates

Traefik automatically provisions Let's Encrypt certificates for DNS-exposed domains. Tunnel-exposed services get HTTPS automatically through Cloudflare.

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

### Port Conflicts

If a container fails to start with "port already in use" or "bind: address already in use":

1. **Find what's using the port:**
   ```bash
   sudo lsof -i :3000
   # or
   sudo ss -tlnp | grep 3000
   ```

2. **Common conflicts:**
   - Another app deployed with the same host port
   - A service running directly on the host (Node dev server, database, etc.)
   - A previous deployment that didn't stop cleanly

3. **Solutions:**
   - Change the host port in your Compose file: `"3001:3000"` instead of `"3000:3000"`
   - Stop the conflicting service
   - Use only container ports without host binding when exposing via Traefik (Traefik routes traffic through Docker networks, not host ports)

**Tip:** When exposing services through Traefik, you don't need host port mappings. Instead of `ports: ["3000:3000"]`, you can use `expose: ["3000"]` to only expose the port to other containers on the same network.

### Service Not Accessible

1. Check that the domain is configured in the app
2. Verify DNS points to your server: `dig myapp.example.com`
3. Check Traefik logs: `docker logs traefik`
4. Verify the container is running: `docker ps`

### DNS Not Created

- Verify your Cloudflare API token is set in Settings
- Check that the token has **Zone → DNS → Edit** permission
- Look for errors in the deployment log

### Tunnel Not Working

- Verify both API token and Account ID are set in Settings
- Check that the token has **Account → Cloudflare Tunnel → Edit** permission
- Look for the `cloudflared` container in `docker ps`
- Check tunnel status in the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
