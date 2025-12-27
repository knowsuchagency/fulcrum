import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { ApiError, CliError } from '../utils/errors'

/**
 * Format a successful tool result with JSON data
 */
export function formatSuccess(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

/**
 * Convert errors to MCP tool error responses
 */
export function handleToolError(error: unknown): CallToolResult {
  if (error instanceof ApiError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.code,
            message: error.message,
            statusCode: error.statusCode,
          }),
        },
      ],
    }
  }

  if (error instanceof CliError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.code,
            message: error.message,
          }),
        },
      ],
    }
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'UNEXPECTED_ERROR',
          message,
        }),
      },
    ],
  }
}
