import { Hono } from 'hono'
import { fetchLinearTicket } from '../services/linear'

const app = new Hono()

// GET /api/linear/ticket/:identifier - Fetch Linear ticket info
app.get('/ticket/:identifier', async (c) => {
  const identifier = c.req.param('identifier')
  const ticket = await fetchLinearTicket(identifier)

  if (!ticket) {
    return c.json({ error: 'Ticket not found or API key not configured' }, 404)
  }

  return c.json(ticket)
})

export default app
