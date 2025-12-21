import { Hono } from 'hono'
import { db, terminalViewState, terminalTabs, terminals } from '../db'
import { eq } from 'drizzle-orm'

const SINGLETON_ID = 'singleton'

interface FocusedTerminalsMap {
  [tabId: string]: string
}

interface TerminalViewStateResponse {
  activeTabId: string | null
  focusedTerminals: FocusedTerminalsMap
}

interface UpdateTerminalViewStateRequest {
  activeTabId?: string | null
  focusedTerminals?: FocusedTerminalsMap
}

// Parse focusedTerminals JSON
function parseViewState(row: typeof terminalViewState.$inferSelect | undefined): TerminalViewStateResponse {
  if (!row) {
    return { activeTabId: null, focusedTerminals: {} }
  }
  return {
    activeTabId: row.activeTabId,
    focusedTerminals: row.focusedTerminals ? JSON.parse(row.focusedTerminals) : {},
  }
}

const app = new Hono()

// GET /api/terminal-view-state - Get current view state
app.get('/', (c) => {
  const row = db.select().from(terminalViewState).where(eq(terminalViewState.id, SINGLETON_ID)).get()
  return c.json(parseViewState(row))
})

// PATCH /api/terminal-view-state - Update view state
app.patch('/', async (c) => {
  const body = await c.req.json<UpdateTerminalViewStateRequest>()
  const now = new Date().toISOString()

  const existing = db.select().from(terminalViewState).where(eq(terminalViewState.id, SINGLETON_ID)).get()

  const updates: Record<string, unknown> = { updatedAt: now }

  if (body.activeTabId !== undefined) {
    // Validate that the tab exists (if not null)
    if (body.activeTabId !== null) {
      const tab = db.select().from(terminalTabs).where(eq(terminalTabs.id, body.activeTabId)).get()
      if (!tab) {
        return c.json({ error: 'Tab not found' }, 404)
      }
    }
    updates.activeTabId = body.activeTabId
  }

  if (body.focusedTerminals !== undefined) {
    // Merge with existing focusedTerminals (partial updates)
    const currentFocused = existing?.focusedTerminals ? JSON.parse(existing.focusedTerminals) : {}
    const merged = { ...currentFocused, ...body.focusedTerminals }

    // Validate terminal IDs exist and remove invalid references
    for (const [tabId, terminalId] of Object.entries(merged)) {
      if (terminalId) {
        const terminal = db.select().from(terminals).where(eq(terminals.id, terminalId)).get()
        if (!terminal) {
          delete merged[tabId]
        }
      }
    }

    updates.focusedTerminals = JSON.stringify(merged)
  }

  if (existing) {
    db.update(terminalViewState)
      .set(updates)
      .where(eq(terminalViewState.id, SINGLETON_ID))
      .run()
  } else {
    db.insert(terminalViewState)
      .values({
        id: SINGLETON_ID,
        activeTabId: updates.activeTabId as string | null,
        focusedTerminals: updates.focusedTerminals as string | undefined,
        updatedAt: now,
      })
      .run()
  }

  const updated = db.select().from(terminalViewState).where(eq(terminalViewState.id, SINGLETON_ID)).get()
  return c.json(parseViewState(updated))
})

export default app
