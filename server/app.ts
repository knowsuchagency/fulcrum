import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getSettings } from './lib/settings'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import healthRoutes from './routes/health'
import tasksRoutes from './routes/tasks'
import gitRoutes from './routes/git'
import filesystemRoutes from './routes/filesystem'
import configRoutes from './routes/config'
import uploadsRoutes from './routes/uploads'
import worktreesRoutes from './routes/worktrees'
import terminalViewStateRoutes from './routes/terminal-view-state'
import repositoriesRoutes from './routes/repositories'

/**
 * Gets the path to the dist directory.
 * In bundled mode (CLI), VIBORA_PACKAGE_ROOT points to the package installation.
 * In dev/source mode, uses CWD.
 */
function getDistPath(): string {
  if (process.env.VIBORA_PACKAGE_ROOT) {
    return join(process.env.VIBORA_PACKAGE_ROOT, 'dist')
  }
  return join(process.cwd(), 'dist')
}

export function createApp() {
  const app = new Hono()

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // Optional HTTP Basic Auth (when configured)
  const settings = getSettings()
  if (settings.basicAuthUsername && settings.basicAuthPassword) {
    app.use(
      '*',
      basicAuth({
        username: settings.basicAuthUsername,
        password: settings.basicAuthPassword,
      })
    )
  }

  // API Routes
  app.route('/health', healthRoutes)
  app.route('/api/tasks', tasksRoutes)
  app.route('/api/git', gitRoutes)
  app.route('/api/fs', filesystemRoutes)
  app.route('/api/config', configRoutes)
  app.route('/api/uploads', uploadsRoutes)
  app.route('/api/worktrees', worktreesRoutes)
  app.route('/api/terminal-view-state', terminalViewStateRoutes)
  app.route('/api/repositories', repositoriesRoutes)

  // Serve static files in production mode or bundled CLI mode
  // Note: Check VIBORA_PACKAGE_ROOT in addition to NODE_ENV because bun build
  // inlines NODE_ENV at build time, removing this block if built without NODE_ENV=production
  if (process.env.NODE_ENV === 'production' || process.env.VIBORA_PACKAGE_ROOT) {
    const distPath = getDistPath()

    // Helper to serve static files with proper MIME types
    const serveFile = async (filePath: string) => {
      const ext = filePath.split('.').pop()?.toLowerCase()
      const mimeTypes: Record<string, string> = {
        html: 'text/html',
        css: 'text/css',
        js: 'application/javascript',
        json: 'application/json',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        ico: 'image/x-icon',
        svg: 'image/svg+xml',
        woff: 'font/woff',
        woff2: 'font/woff2',
      }
      const content = await readFile(filePath)
      return new Response(content, {
        headers: { 'Content-Type': mimeTypes[ext || ''] || 'application/octet-stream' },
      })
    }

    // Serve assets
    app.get('/assets/*', async (c) => {
      const assetPath = join(distPath, c.req.path)
      if (existsSync(assetPath)) {
        return serveFile(assetPath)
      }
      return c.notFound()
    })

    // Serve specific static files
    const staticFiles = ['favicon.ico', 'vibora-icon.png', 'vibora-logo.jpeg', 'vite.svg']
    for (const file of staticFiles) {
      app.get(`/${file}`, async () => {
        const filePath = join(distPath, file)
        if (existsSync(filePath)) {
          return serveFile(filePath)
        }
        return new Response('Not Found', { status: 404 })
      })
    }

    // SPA fallback - serve index.html for all other routes (except API and WebSocket)
    app.get('*', async (c, next) => {
      const path = c.req.path
      // Skip API routes, WebSocket routes, and health check
      if (path.startsWith('/api/') || path.startsWith('/ws/') || path === '/health') {
        return next()
      }
      const html = await readFile(join(distPath, 'index.html'), 'utf-8')
      return c.html(html)
    })
  }

  return app
}
