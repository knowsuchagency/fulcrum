import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, terminalViewState, terminalTabs, terminals } from '../db'

describe('Terminal View State Routes', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('GET /api/terminal-view-state', () => {
    test('returns default state when no state exists', async () => {
      const { get } = createTestApp()
      const res = await get('/api/terminal-view-state')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.activeTabId).toBeNull()
      expect(body.focusedTerminals).toEqual({})
      expect(body.currentView).toBeNull()
      expect(body.currentTaskId).toBeNull()
      expect(body.isTabVisible).toBeNull()
    })

    test('returns stored state', async () => {
      const now = new Date().toISOString()

      // First create a tab to reference
      db.insert(terminalTabs)
        .values({
          id: 'tab-1',
          name: 'Test Tab',
          position: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      // Create a terminal to reference
      db.insert(terminals)
        .values({
          id: 'term-1',
          tabId: 'tab-1',
          name: 'Terminal 1',
          cwd: '/tmp',
          tmuxSession: 'term-1',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      // Insert view state
      db.insert(terminalViewState)
        .values({
          id: 'singleton',
          activeTabId: 'tab-1',
          focusedTerminals: JSON.stringify({ 'tab-1': 'term-1' }),
          currentView: 'terminals',
          currentTaskId: 'task-123',
          isTabVisible: true,
          viewUpdatedAt: now,
          updatedAt: now,
        })
        .run()

      const { get } = createTestApp()
      const res = await get('/api/terminal-view-state')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.activeTabId).toBe('tab-1')
      expect(body.focusedTerminals).toEqual({ 'tab-1': 'term-1' })
      expect(body.currentView).toBe('terminals')
      expect(body.currentTaskId).toBe('task-123')
      expect(body.isTabVisible).toBe(true)
    })
  })

  describe('PATCH /api/terminal-view-state', () => {
    test('creates state if it does not exist', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        currentView: 'tasks',
        isTabVisible: true,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.currentView).toBe('tasks')
      expect(body.isTabVisible).toBe(true)
    })

    test('updates activeTabId', async () => {
      const now = new Date().toISOString()

      // Create a tab to reference
      db.insert(terminalTabs)
        .values({
          id: 'active-tab',
          name: 'Active Tab',
          position: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        activeTabId: 'active-tab',
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.activeTabId).toBe('active-tab')
    })

    test('returns 404 for non-existent tab', async () => {
      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        activeTabId: 'nonexistent-tab',
      })
      const body = await res.json()

      expect(res.status).toBe(404)
      expect(body.error).toContain('Tab not found')
    })

    test('allows setting activeTabId to null', async () => {
      const now = new Date().toISOString()

      // Set up initial state with an active tab
      db.insert(terminalTabs)
        .values({
          id: 'tab-to-deactivate',
          name: 'Tab',
          position: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      db.insert(terminalViewState)
        .values({
          id: 'singleton',
          activeTabId: 'tab-to-deactivate',
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        activeTabId: null,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.activeTabId).toBeNull()
    })

    test('updates focusedTerminals with merge behavior', async () => {
      const now = new Date().toISOString()

      // Create tabs and terminals
      db.insert(terminalTabs)
        .values([
          { id: 'tab-a', name: 'Tab A', position: 0, createdAt: now, updatedAt: now },
          { id: 'tab-b', name: 'Tab B', position: 1, createdAt: now, updatedAt: now },
        ])
        .run()

      db.insert(terminals)
        .values([
          { id: 'term-a1', tabId: 'tab-a', name: 'Terminal A1', cwd: '/tmp', tmuxSession: 'term-a1', createdAt: now, updatedAt: now },
          { id: 'term-b1', tabId: 'tab-b', name: 'Terminal B1', cwd: '/tmp', tmuxSession: 'term-b1', createdAt: now, updatedAt: now },
        ])
        .run()

      // Set initial focused terminal
      db.insert(terminalViewState)
        .values({
          id: 'singleton',
          focusedTerminals: JSON.stringify({ 'tab-a': 'term-a1' }),
          updatedAt: now,
        })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        focusedTerminals: { 'tab-b': 'term-b1' },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      // Should have merged both
      expect(body.focusedTerminals).toEqual({
        'tab-a': 'term-a1',
        'tab-b': 'term-b1',
      })
    })

    test('removes invalid terminal references from focusedTerminals', async () => {
      const now = new Date().toISOString()

      // Create only one tab/terminal
      db.insert(terminalTabs)
        .values({ id: 'valid-tab', name: 'Valid Tab', position: 0, createdAt: now, updatedAt: now })
        .run()

      db.insert(terminals)
        .values({ id: 'valid-term', tabId: 'valid-tab', name: 'Valid Terminal', cwd: '/tmp', tmuxSession: 'valid-term', createdAt: now, updatedAt: now })
        .run()

      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        focusedTerminals: {
          'valid-tab': 'valid-term',
          'invalid-tab': 'invalid-term',
        },
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      // Invalid terminal reference should be removed
      expect(body.focusedTerminals).toEqual({ 'valid-tab': 'valid-term' })
    })

    test('updates view tracking fields', async () => {
      const viewUpdatedAt = new Date().toISOString()

      const { patch } = createTestApp()
      const res = await patch('/api/terminal-view-state', {
        currentView: 'monitoring',
        currentTaskId: 'task-xyz',
        isTabVisible: false,
        viewUpdatedAt,
      })
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.currentView).toBe('monitoring')
      expect(body.currentTaskId).toBe('task-xyz')
      expect(body.isTabVisible).toBe(false)
      expect(body.viewUpdatedAt).toBe(viewUpdatedAt)
    })
  })
})
