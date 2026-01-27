/**
 * Tests to prevent regressions in MCP tool schema definitions.
 *
 * MCP SDK v1.11.0's isZ4Schema() function crashes when iterating over
 * tool schemas that use Zod's .default() wrapper. This test ensures
 * we don't reintroduce this pattern.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools } from '../../mcp/tools'

const TOOLS_DIR = join(import.meta.dir, '../../mcp/tools')

describe('MCP Tool Schema Validation', () => {
  describe('static analysis', () => {
    test('tool schemas should not use .default() in schema definitions', () => {
      // Get all tool files (excluding types.ts and index.ts)
      const toolFiles = readdirSync(TOOLS_DIR).filter(
        (f) => f.endsWith('.ts') && f !== 'types.ts' && f !== 'index.ts'
      )

      const violations: string[] = []

      for (const file of toolFiles) {
        const content = readFileSync(join(TOOLS_DIR, file), 'utf-8')

        // Look for .default() calls that appear to be in schema definitions
        // Pattern: z.something().default( or z.something().something().default(
        const defaultPattern = /z\.[a-z]+\([^)]*\)(?:\.[a-z]+\([^)]*\))*\.default\(/gi
        const matches = content.match(defaultPattern)

        if (matches) {
          violations.push(`${file}: ${matches.length} .default() usage(s) found`)
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `MCP SDK v1.11.0 crashes when Zod schemas use .default(). ` +
            `Move default handling to the handler function instead.\n\n` +
            `Violations:\n${violations.join('\n')}`
        )
      }
    })
  })

  describe('runtime validation', () => {
    test('registerTools should not throw when registering all tools', () => {
      // Create a mock MCP server
      const server = new McpServer({
        name: 'test-fulcrum',
        version: '0.0.0',
      })

      // Create a mock client that throws for all methods (we're not testing functionality)
      const mockClient = new Proxy(
        {},
        {
          get: () => () => {
            throw new Error('Mock client method called')
          },
        }
      )

      // This should not throw - if it does, a schema is malformed
      expect(() => {
        registerTools(server, mockClient as never)
      }).not.toThrow()
    })
  })
})
