/**
 * Core/meta MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { ToolCategorySchema } from './types'
import { formatSuccess, handleToolError } from '../utils'
import { searchTools, toolRegistry } from '../registry'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const registerCoreTools: ToolRegistrar = (server, _client) => {
  server.tool(
    'search_tools',
    'Search for available Fulcrum MCP tools by keyword or category. Use this to discover tools for projects, apps, files, tasks, and more.',
    {
      query: z
        .optional(z.string())
        .describe('Search query to match against tool names, descriptions, and keywords'),
      category: z.optional(ToolCategorySchema).describe('Filter by tool category'),
    },
    async ({ query, category }) => {
      try {
        let results = query ? searchTools(query) : toolRegistry

        if (category) {
          results = results.filter((tool) => tool.category === category)
        }

        const formatted = results.map((tool) => ({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          keywords: tool.keywords,
        }))

        return formatSuccess({
          count: formatted.length,
          tools: formatted,
          hint: query
            ? `Found ${formatted.length} tools matching "${query}"`
            : `Listing ${formatted.length} tools${category ? ` in category "${category}"` : ''}`,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
