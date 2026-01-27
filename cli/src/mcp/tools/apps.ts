/**
 * App deployment MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { AppStatusSchema } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerAppTools: ToolRegistrar = (server, client) => {
  // list_apps
  server.tool(
    'list_apps',
    'List all deployed apps with optional filtering by status',
    {
      status: z.optional(AppStatusSchema).describe('Filter by status'),
    },
    async ({ status }) => {
      try {
        let apps = await client.listApps()
        if (status) {
          apps = apps.filter((a) => a.status === status)
        }
        return formatSuccess(apps)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app
  server.tool(
    'get_app',
    'Get details of a specific app including services and repository',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const app = await client.getApp(id)
        return formatSuccess(app)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_app
  server.tool(
    'create_app',
    'Create a new app for deployment from a repository',
    {
      name: z.string().describe('App name'),
      repositoryId: z.string().describe('Repository ID to deploy from'),
      branch: z.optional(z.string()).describe('Git branch (default: main)'),
      composeFile: z
        .optional(z.string())
        .describe('Path to compose file (auto-detected if omitted)'),
      autoDeployEnabled: z.boolean().default(false).describe('Enable auto-deploy on git push'),
      noCacheBuild: z.boolean().default(false).describe('Disable Docker build cache'),
    },
    async ({ name, repositoryId, branch, composeFile, autoDeployEnabled, noCacheBuild }) => {
      try {
        const app = await client.createApp({
          name,
          repositoryId,
          branch,
          composeFile,
          autoDeployEnabled,
          noCacheBuild,
        })
        return formatSuccess(app)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // deploy_app
  server.tool(
    'deploy_app',
    'Trigger a deployment for an app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.deployApp(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // stop_app
  server.tool(
    'stop_app',
    'Stop a running app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.stopApp(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app_logs
  server.tool(
    'get_app_logs',
    'Get logs from an app, optionally for a specific service',
    {
      id: z.string().describe('App ID'),
      service: z.optional(z.string()).describe('Service name (all services if omitted)'),
      tail: z.optional(z.number()).describe('Number of lines to return (default: 100)'),
    },
    async ({ id, service, tail }) => {
      try {
        const result = await client.getAppLogs(id, { service, tail })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_app_status
  server.tool(
    'get_app_status',
    'Get the current container status for an app',
    {
      id: z.string().describe('App ID'),
    },
    async ({ id }) => {
      try {
        const result = await client.getAppStatus(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_deployments
  server.tool(
    'list_deployments',
    'Get deployment history for an app',
    {
      appId: z.string().describe('App ID'),
    },
    async ({ appId }) => {
      try {
        const deployments = await client.listDeployments(appId)
        return formatSuccess(deployments)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_app
  server.tool(
    'delete_app',
    'Delete an app and optionally stop its containers',
    {
      id: z.string().describe('App ID'),
      stopContainers: z.boolean().default(true).describe('Stop running containers before deletion'),
    },
    async ({ id, stopContainers }) => {
      try {
        await client.deleteApp(id, stopContainers)
        return formatSuccess({ deleted: id })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
