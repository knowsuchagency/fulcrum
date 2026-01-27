/**
 * Project MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { ProjectStatusSchema } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerProjectTools: ToolRegistrar = (server, client) => {
  // list_projects
  server.tool(
    'list_projects',
    'List all Fulcrum projects with optional filtering by status',
    {
      status: z.optional(ProjectStatusSchema).describe('Filter by status (active or archived)'),
    },
    async ({ status }) => {
      try {
        let projects = await client.listProjects()
        if (status) {
          projects = projects.filter((p) => p.status === status)
        }
        return formatSuccess(projects)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_project
  server.tool(
    'get_project',
    'Get details of a specific project by ID, including repository and app information',
    {
      id: z.string().describe('Project ID'),
    },
    async ({ id }) => {
      try {
        const project = await client.getProject(id)
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_project
  server.tool(
    'create_project',
    'Create a new project from a local path, git URL, or existing repository',
    {
      name: z.string().describe('Project name'),
      description: z.optional(z.string()).describe('Project description'),
      repositoryId: z.optional(z.string()).describe('Link to existing repository ID'),
      path: z.optional(z.string()).describe('Create from local directory path'),
      url: z.optional(z.string()).describe('Clone from git URL'),
      targetDir: z.optional(z.string()).describe('Target directory for cloning (only with url)'),
      folderName: z.optional(z.string()).describe('Folder name for cloned repo (only with url)'),
    },
    async ({ name, description, repositoryId, path, url, targetDir, folderName }) => {
      try {
        const project = await client.createProject({
          name,
          description,
          repositoryId,
          path,
          url,
          targetDir,
          folderName,
        })
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_project
  server.tool(
    'update_project',
    'Update project metadata (name, description, notes, or status)',
    {
      id: z.string().describe('Project ID'),
      name: z.optional(z.string()).describe('New name'),
      description: z.optional(z.string()).describe('New description'),
      notes: z.optional(z.nullable(z.string())).describe('New notes (set to null to clear)'),
      status: z.optional(ProjectStatusSchema).describe('New status (active or archived)'),
    },
    async ({ id, name, description, notes, status }) => {
      try {
        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (description !== undefined) updates.description = description
        if (notes !== undefined) updates.notes = notes
        if (status !== undefined) updates.status = status
        const project = await client.updateProject(id, updates)
        return formatSuccess(project)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_project
  server.tool(
    'delete_project',
    'Delete a project and optionally its directory and app',
    {
      id: z.string().describe('Project ID'),
      deleteDirectory: z
        .boolean()
        .default(false)
        .describe('Also delete the repository directory from disk'),
      deleteApp: z.boolean().default(false).describe('Also delete the linked app'),
    },
    async ({ id, deleteDirectory, deleteApp }) => {
      try {
        const result = await client.deleteProject(id, { deleteDirectory, deleteApp })
        return formatSuccess({ deleted: id, ...result })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // scan_projects
  server.tool(
    'scan_projects',
    'Scan a directory for git repositories and check which have projects',
    {
      directory: z
        .optional(z.string())
        .describe('Directory to scan (defaults to configured git repos dir)'),
    },
    async ({ directory }) => {
      try {
        const result = await client.scanProjects(directory)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_project_tag
  server.tool(
    'add_project_tag',
    'Add a tag to a project. You can provide either an existing tag ID or a tag name (creates new if needed).',
    {
      projectId: z.string().describe('Project ID'),
      tag: z.string().describe('Tag name or tag ID to add'),
    },
    async ({ projectId, tag }) => {
      try {
        const result = await client.addProjectTag(projectId, tag)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // remove_project_tag
  server.tool(
    'remove_project_tag',
    'Remove a tag from a project',
    {
      projectId: z.string().describe('Project ID'),
      tagId: z.string().describe('Tag ID to remove'),
    },
    async ({ projectId, tagId }) => {
      try {
        const result = await client.removeProjectTag(projectId, tagId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_project_attachments
  server.tool(
    'list_project_attachments',
    'List all file attachments for a project',
    {
      projectId: z.string().describe('Project ID'),
    },
    async ({ projectId }) => {
      try {
        const attachments = await client.listProjectAttachments(projectId)
        return formatSuccess(attachments)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // upload_project_attachment
  server.tool(
    'upload_project_attachment',
    'Upload a file to a project from a local path. Supported types: PDF, images (PNG, JPEG, GIF, WebP, SVG), text files, Word docs, Excel spreadsheets, JSON, archives.',
    {
      projectId: z.string().describe('Project ID'),
      filePath: z.string().describe('Absolute path to file on the local filesystem'),
    },
    async ({ projectId, filePath }) => {
      try {
        const attachment = await client.uploadProjectAttachment(projectId, filePath)
        return formatSuccess(attachment)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_project_attachment
  server.tool(
    'delete_project_attachment',
    'Delete a file attachment from a project',
    {
      projectId: z.string().describe('Project ID'),
      attachmentId: z.string().describe('Attachment ID to delete'),
    },
    async ({ projectId, attachmentId }) => {
      try {
        const result = await client.deleteProjectAttachment(projectId, attachmentId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_project_attachment_path
  server.tool(
    'get_project_attachment_path',
    'Get the local file path for a project attachment. Use this to read attachment contents with file tools.',
    {
      projectId: z.string().describe('Project ID'),
      attachmentId: z.string().describe('Attachment ID'),
    },
    async ({ projectId, attachmentId }) => {
      try {
        const result = await client.getProjectAttachmentPath(projectId, attachmentId)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_project_links
  server.tool(
    'list_project_links',
    'List all URL links attached to a project',
    {
      projectId: z.string().describe('Project ID'),
    },
    async ({ projectId }) => {
      try {
        const links = await client.listProjectLinks(projectId)
        return formatSuccess(links)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // add_project_link
  server.tool(
    'add_project_link',
    'Add a URL link to a project (for documentation, related PRs, design files, etc.)',
    {
      projectId: z.string().describe('Project ID'),
      url: z.string().url().describe('URL to add'),
      label: z.optional(z.string()).describe('Display label (auto-detected if not provided)'),
    },
    async ({ projectId, url, label }) => {
      try {
        const link = await client.addProjectLink(projectId, url, label)
        return formatSuccess(link)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // remove_project_link
  server.tool(
    'remove_project_link',
    'Remove a URL link from a project',
    {
      projectId: z.string().describe('Project ID'),
      linkId: z.string().describe('Link ID to remove'),
    },
    async ({ projectId, linkId }) => {
      try {
        await client.removeProjectLink(projectId, linkId)
        return formatSuccess({ removed: linkId })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
