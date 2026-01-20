import { Hono } from 'hono'

const app = new Hono()

// Track server startup time for uptime calculation
const startTime = Date.now()

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    version: process.env.FULCRUM_VERSION || null,
    uptime: Date.now() - startTime,
  })
})

export default app
