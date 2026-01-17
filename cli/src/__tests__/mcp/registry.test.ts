import { describe, test, expect } from 'bun:test'
import {
  searchTools,
  getToolsByCategory,
  getCoreTools,
  getDeferredTools,
  getToolByName,
  toolRegistry,
} from '../../mcp/registry'

describe('MCP Tool Registry', () => {
  describe('searchTools', () => {
    test('finds tools by name', () => {
      const results = searchTools('list_tasks')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.name === 'list_tasks')).toBe(true)
    })

    test('finds tools by keyword', () => {
      const results = searchTools('deploy')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.name === 'deploy_app')).toBe(true)
    })

    test('finds tools by category keyword', () => {
      const results = searchTools('filesystem')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.category === 'filesystem')).toBe(true)
    })

    test('finds tools by partial match', () => {
      const results = searchTools('project create')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.name === 'create_project')).toBe(true)
    })

    test('returns empty array for no matches', () => {
      const results = searchTools('xyznonexistent123')
      expect(results).toEqual([])
    })

    test('is case insensitive', () => {
      const results = searchTools('DEPLOY APP')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some((t) => t.name === 'deploy_app')).toBe(true)
    })
  })

  describe('getToolsByCategory', () => {
    test('gets all task tools', () => {
      const results = getToolsByCategory('tasks')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => t.category === 'tasks')).toBe(true)
    })

    test('gets all app tools', () => {
      const results = getToolsByCategory('apps')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => t.category === 'apps')).toBe(true)
    })

    test('gets all filesystem tools', () => {
      const results = getToolsByCategory('filesystem')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => t.category === 'filesystem')).toBe(true)
    })
  })

  describe('getCoreTools', () => {
    test('returns only non-deferred tools', () => {
      const results = getCoreTools()
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => !t.deferred)).toBe(true)
    })
  })

  describe('getDeferredTools', () => {
    test('returns only deferred tools', () => {
      const results = getDeferredTools()
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => t.deferred)).toBe(true)
    })
  })

  describe('getToolByName', () => {
    test('finds existing tool', () => {
      const result = getToolByName('list_tasks')
      expect(result).toBeDefined()
      expect(result?.name).toBe('list_tasks')
    })

    test('returns undefined for non-existent tool', () => {
      const result = getToolByName('nonexistent_tool')
      expect(result).toBeUndefined()
    })
  })

  describe('toolRegistry', () => {
    test('has unique tool names', () => {
      const names = toolRegistry.map((t) => t.name)
      const uniqueNames = new Set(names)
      expect(names.length).toBe(uniqueNames.size)
    })

    test('all tools have required fields', () => {
      for (const tool of toolRegistry) {
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.category).toBeDefined()
        expect(tool.keywords).toBeDefined()
        expect(Array.isArray(tool.keywords)).toBe(true)
        expect(typeof tool.deferred).toBe('boolean')
      }
    })
  })
})
