import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import healthRoutes from './routes/health'
import tasksRoutes from './routes/tasks'
import gitRoutes from './routes/git'
import filesystemRoutes from './routes/filesystem'
import configRoutes from './routes/config'
import uploadsRoutes from './routes/uploads'
import worktreesRoutes from './routes/worktrees'
import terminalViewStateRoutes from './routes/terminal-view-state'

export function createApp() {
  const app = new Hono()

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })
  )

  // API Routes
  app.route('/health', healthRoutes)
  app.route('/api/tasks', tasksRoutes)
  app.route('/api/git', gitRoutes)
  app.route('/api/fs', filesystemRoutes)
  app.route('/api/config', configRoutes)
  app.route('/api/uploads', uploadsRoutes)
  app.route('/api/worktrees', worktreesRoutes)
  app.route('/api/terminal-view-state', terminalViewStateRoutes)

  // Serve static files from dist/ in production
  if (process.env.NODE_ENV === 'production') {
    app.use('/assets/*', serveStatic({ root: './dist' }))
    app.use('/favicon.ico', serveStatic({ path: './dist/favicon.ico' }))
    app.use('/vibora-icon.png', serveStatic({ path: './dist/vibora-icon.png' }))
    app.use('/vibora-logo.jpeg', serveStatic({ path: './dist/vibora-logo.jpeg' }))
    app.use('/vite.svg', serveStatic({ path: './dist/vite.svg' }))

    // SPA fallback - serve index.html for all other routes (except API and WebSocket)
    app.get('*', async (c, next) => {
      const path = c.req.path
      // Skip API routes, WebSocket routes, and health check
      if (path.startsWith('/api/') || path.startsWith('/ws/') || path === '/health') {
        return next()
      }
      const html = await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf-8')
      return c.html(html)
    })
  }

  return app
}
