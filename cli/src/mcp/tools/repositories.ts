/**
 * Repository MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { AgentTypeSchema } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerRepositoryTools: ToolRegistrar = (server, client) => {
  // list_repositories
  server.tool(
    'list_repositories',
    'List all configured repositories. Supports filtering for orphans (not linked to any project) or by project.',
    {
      orphans: z
        .optional(z.boolean())
        .describe('Only return repositories not linked to any project'),
      projectId: z
        .optional(z.string())
        .describe('Only return repositories linked to this project'),
    },
    async ({ orphans, projectId }) => {
      try {
        const repos = await client.listRepositories({ orphans, projectId })
        return formatSuccess(repos)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_repository
  server.tool(
    'get_repository',
    'Get details of a specific repository by ID',
    {
      id: z.string().describe('Repository ID'),
    },
    async ({ id }) => {
      try {
        const repo = await client.getRepository(id)
        return formatSuccess(repo)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_repository
  server.tool(
    'add_repository',
    'Add a repository from a local path. The path must be an existing git repository.',
    {
      path: z.string().describe('Absolute path to the git repository'),
      displayName: z.optional(z.string()).describe('Display name (defaults to folder name)'),
    },
    async ({ path, displayName }) => {
      try {
        const repo = await client.addRepository(path, displayName)
        return formatSuccess(repo)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_repository
  server.tool(
    'update_repository',
    'Update repository metadata (display name, startup script, copy files pattern, default agent)',
    {
      id: z.string().describe('Repository ID'),
      displayName: z.optional(z.string()).describe('New display name'),
      startupScript: z
        .optional(z.nullable(z.string()))
        .describe('Startup script to run when starting a task (null to clear)'),
      copyFiles: z
        .optional(z.nullable(z.string()))
        .describe('Files/patterns to copy to new worktrees (null to clear)'),
      defaultAgent: z
        .optional(z.nullable(AgentTypeSchema))
        .describe('Default agent (claude, opencode, or null to clear)'),
    },
    async ({ id, displayName, startupScript, copyFiles, defaultAgent }) => {
      try {
        const updates: Record<string, unknown> = {}
        if (displayName !== undefined) updates.displayName = displayName
        if (startupScript !== undefined) updates.startupScript = startupScript
        if (copyFiles !== undefined) updates.copyFiles = copyFiles
        if (defaultAgent !== undefined) updates.defaultAgent = defaultAgent
        const repo = await client.updateRepository(id, updates)
        return formatSuccess(repo)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_repository
  server.tool(
    'delete_repository',
    'Delete an orphaned repository. Will fail if the repository is linked to a project.',
    {
      id: z.string().describe('Repository ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.deleteRepository(id)
        return formatSuccess({ deleted: id, ...result })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // link_repository_to_project
  server.tool(
    'link_repository_to_project',
    'Link a repository to a project. Each repository can only be linked to one project at a time. Use force to move from an existing project.',
    {
      repositoryId: z.string().describe('Repository ID to link'),
      projectId: z.string().describe('Project ID to link to'),
      isPrimary: z
        .optional(z.boolean())
        .describe('Set as primary repository for the project'),
      force: z
        .optional(z.boolean())
        .describe('Move repository from existing project if already linked'),
    },
    async ({ repositoryId, projectId, isPrimary, force }) => {
      try {
        const result = await client.linkRepositoryToProject(repositoryId, projectId, {
          isPrimary,
          force,
        })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // unlink_repository_from_project
  server.tool(
    'unlink_repository_from_project',
    'Unlink a repository from a project. The repository becomes orphaned and can be linked to another project.',
    {
      repositoryId: z.string().describe('Repository ID to unlink'),
      projectId: z.string().describe('Project ID to unlink from'),
    },
    async ({ repositoryId, projectId }) => {
      try {
        const result = await client.unlinkRepositoryFromProject(repositoryId, projectId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
