/**
 * Filesystem MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerFilesystemTools: ToolRegistrar = (server, client) => {
  // list_directory
  server.tool(
    'list_directory',
    'List contents of a directory',
    {
      path: z.optional(z.string()).describe('Directory path (default: home directory)'),
    },
    async ({ path }) => {
      try {
        const result = await client.listDirectory(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_file_tree
  server.tool(
    'get_file_tree',
    'Get recursive file tree for a directory',
    {
      root: z.string().describe('Root directory path'),
    },
    async ({ root }) => {
      try {
        const result = await client.getFileTree(root)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // read_file
  server.tool(
    'read_file',
    'Read file contents (with path traversal protection)',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      maxLines: z.optional(z.number()).describe('Maximum lines to return (default: 5000)'),
    },
    async ({ path, root, maxLines }) => {
      try {
        const result = await client.readFile(path, root, maxLines)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // write_file
  server.tool(
    'write_file',
    'Write content to an existing file (with path traversal protection)',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      content: z.string().describe('File content to write'),
    },
    async ({ path, root, content }) => {
      try {
        const result = await client.writeFile({ path, root, content })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // edit_file
  server.tool(
    'edit_file',
    'Edit a file by replacing an exact string (must be unique in file). The old_string must appear exactly once in the file.',
    {
      path: z.string().describe('File path relative to root'),
      root: z.string().describe('Root directory for security boundary'),
      old_string: z.string().describe('Exact string to find (must appear exactly once)'),
      new_string: z.string().describe('String to replace it with'),
    },
    async ({ path, root, old_string, new_string }) => {
      try {
        const result = await client.editFile({ path, root, old_string, new_string })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // file_stat
  server.tool(
    'file_stat',
    'Get file or directory metadata',
    {
      path: z.string().describe('Path to check'),
    },
    async ({ path }) => {
      try {
        const result = await client.getPathStat(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // is_git_repo
  server.tool(
    'is_git_repo',
    'Check if a directory is a git repository',
    {
      path: z.string().describe('Directory path to check'),
    },
    async ({ path }) => {
      try {
        const result = await client.isGitRepo(path)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
