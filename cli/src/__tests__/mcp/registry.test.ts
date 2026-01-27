import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  searchTools,
  getToolsByCategory,
  getCoreTools,
  getDeferredTools,
  getToolByName,
  toolRegistry,
} from '../../mcp/registry'

const TOOLS_DIR = join(import.meta.dir, '../../mcp/tools')

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
      expect(results.every((t) => !t.defer_loading)).toBe(true)
    })
  })

  describe('getDeferredTools', () => {
    test('returns only deferred tools', () => {
      const results = getDeferredTools()
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((t) => t.defer_loading)).toBe(true)
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
        expect(typeof tool.defer_loading).toBe('boolean')
      }
    })

    test('all registered tools are in the registry (search_tools can find them)', () => {
      // Extract tool names from server.tool() calls in source files
      // This ensures search_tools can discover all available tools
      const toolFiles = readdirSync(TOOLS_DIR).filter(
        (f) => f.endsWith('.ts') && f !== 'types.ts' && f !== 'index.ts'
      )

      const registeredTools = new Set<string>()

      for (const file of toolFiles) {
        const content = readFileSync(join(TOOLS_DIR, file), 'utf-8')

        // Match server.tool('tool_name', patterns
        // The tool name is on the next line after server.tool(
        const lines = content.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i].includes('server.tool(')) {
            // Check next line for the tool name in quotes
            const nextLine = lines[i + 1]
            const match = nextLine.match(/^\s*['"]([a-z_]+)['"]/)
            if (match) {
              registeredTools.add(match[1])
            }
          }
        }
      }

      // Get tool names from registry
      const registryTools = new Set(toolRegistry.map((t) => t.name))

      // Find tools that are registered but not in the registry
      const missingFromRegistry: string[] = []
      for (const tool of registeredTools) {
        if (!registryTools.has(tool)) {
          missingFromRegistry.push(tool)
        }
      }

      if (missingFromRegistry.length > 0) {
        throw new Error(
          `The following tools are registered via server.tool() but missing from toolRegistry.\n` +
            `Users won't be able to discover them via search_tools!\n\n` +
            `Missing tools: ${missingFromRegistry.join(', ')}\n\n` +
            `Add entries for these tools to cli/src/mcp/registry.ts`
        )
      }
    })

    test('registry has no orphaned entries (all entries have matching tools)', () => {
      // Extract tool names from server.tool() calls in source files
      const toolFiles = readdirSync(TOOLS_DIR).filter(
        (f) => f.endsWith('.ts') && f !== 'types.ts' && f !== 'index.ts'
      )

      const registeredTools = new Set<string>()

      for (const file of toolFiles) {
        const content = readFileSync(join(TOOLS_DIR, file), 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i].includes('server.tool(')) {
            const nextLine = lines[i + 1]
            const match = nextLine.match(/^\s*['"]([a-z_]+)['"]/)
            if (match) {
              registeredTools.add(match[1])
            }
          }
        }
      }

      // Find registry entries without matching registered tools
      const orphanedEntries: string[] = []
      for (const tool of toolRegistry) {
        if (!registeredTools.has(tool.name)) {
          orphanedEntries.push(tool.name)
        }
      }

      if (orphanedEntries.length > 0) {
        throw new Error(
          `The following toolRegistry entries have no matching server.tool() registration.\n` +
            `These are orphaned metadata entries that should be removed.\n\n` +
            `Orphaned entries: ${orphanedEntries.join(', ')}\n\n` +
            `Remove these from cli/src/mcp/registry.ts`
        )
      }
    })
  })
})
