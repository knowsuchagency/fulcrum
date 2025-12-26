import { db, terminalTabs, terminalViewState } from '../db'
import { eq, sql, max } from 'drizzle-orm'
import type { TabInfo } from '../types'

const VIEW_STATE_ID = 'singleton'

/**
 * Manages terminal tabs as first-class entities.
 * Tabs can exist independently of terminals.
 */
export class TabManager {
  /**
   * Create a new tab
   */
  create(options: { name: string; position?: number; directory?: string }): TabInfo {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // If no position specified, put it at the end
    const position = options.position ?? this.getNextPosition()

    db.insert(terminalTabs)
      .values({
        id,
        name: options.name,
        position,
        directory: options.directory ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return {
      id,
      name: options.name,
      position,
      directory: options.directory,
      createdAt: Date.now(),
    }
  }

  /**
   * Update a tab's name and/or directory
   */
  update(tabId: string, updates: { name?: string; directory?: string | null }): boolean {
    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() }

    if (updates.name !== undefined) {
      updateData.name = updates.name
    }
    if (updates.directory !== undefined) {
      updateData.directory = updates.directory
    }

    const result = db
      .update(terminalTabs)
      .set(updateData)
      .where(eq(terminalTabs.id, tabId))
      .run()

    return result.changes > 0
  }

  /**
   * Delete a tab
   */
  delete(tabId: string): boolean {
    const result = db.delete(terminalTabs).where(eq(terminalTabs.id, tabId)).run()

    if (result.changes > 0) {
      // Clean up view state references
      const viewState = db
        .select()
        .from(terminalViewState)
        .where(eq(terminalViewState.id, VIEW_STATE_ID))
        .get()

      if (viewState) {
        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }

        // If deleted tab was active, switch to first remaining tab
        if (viewState.activeTabId === tabId) {
          const remainingTabs = this.list()
          updates.activeTabId = remainingTabs.length > 0 ? remainingTabs[0].id : null
        }

        // Remove focused terminal entry for deleted tab
        if (viewState.focusedTerminals) {
          const focused = JSON.parse(viewState.focusedTerminals)
          delete focused[tabId]
          updates.focusedTerminals = JSON.stringify(focused)
        }

        db.update(terminalViewState)
          .set(updates)
          .where(eq(terminalViewState.id, VIEW_STATE_ID))
          .run()
      }
    }

    return result.changes > 0
  }

  /**
   * Reorder a tab to a new position
   */
  reorder(tabId: string, newPosition: number): boolean {
    const tab = this.get(tabId)
    if (!tab) return false

    const oldPosition = tab.position
    const now = new Date().toISOString()

    // Shift other tabs
    if (newPosition > oldPosition) {
      // Moving down: shift tabs in between up
      db.run(sql`
        UPDATE terminal_tabs
        SET position = position - 1, updated_at = ${now}
        WHERE position > ${oldPosition} AND position <= ${newPosition}
      `)
    } else if (newPosition < oldPosition) {
      // Moving up: shift tabs in between down
      db.run(sql`
        UPDATE terminal_tabs
        SET position = position + 1, updated_at = ${now}
        WHERE position >= ${newPosition} AND position < ${oldPosition}
      `)
    }

    // Update the tab's position
    db.update(terminalTabs)
      .set({ position: newPosition, updatedAt: now })
      .where(eq(terminalTabs.id, tabId))
      .run()

    return true
  }

  /**
   * Get a single tab by ID
   */
  get(tabId: string): TabInfo | null {
    const row = db.select().from(terminalTabs).where(eq(terminalTabs.id, tabId)).get()
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      position: row.position,
      directory: row.directory ?? undefined,
      createdAt: new Date(row.createdAt).getTime(),
    }
  }

  /**
   * List all tabs, sorted by position
   */
  list(): TabInfo[] {
    const rows = db.select().from(terminalTabs).orderBy(terminalTabs.position).all()

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      directory: row.directory ?? undefined,
      createdAt: new Date(row.createdAt).getTime(),
    }))
  }

  /**
   * Get the next available position (for appending new tabs)
   */
  private getNextPosition(): number {
    const result = db
      .select({ maxPos: max(terminalTabs.position) })
      .from(terminalTabs)
      .get()

    return (result?.maxPos ?? -1) + 1
  }

  /**
   * Ensure at least one default tab exists
   */
  ensureDefaultTab(): TabInfo {
    const tabs = this.list()
    if (tabs.length > 0) {
      return tabs[0]
    }

    // Create default "Main" tab
    return this.create({ name: 'Main', position: 0 })
  }
}

// Singleton instance
let tabManager: TabManager | null = null

export function getTabManager(): TabManager {
  if (!tabManager) {
    tabManager = new TabManager()
  }
  return tabManager
}
