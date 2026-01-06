import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchJSON } from '@/lib/api'
import type { ProjectWithDetails } from '@/types'

/**
 * Legacy route: /apps/$appId
 * Redirects to /projects/$projectId where the project contains this app
 */
export const Route = createFileRoute('/apps/$appId')({
  loader: async ({ params }) => {
    // Find the project that contains this app
    const projects = await fetchJSON<ProjectWithDetails[]>('/api/projects')
    const project = projects.find((p) => p.app?.id === params.appId)

    if (project) {
      throw redirect({
        to: '/projects/$projectId',
        params: { projectId: project.id },
        search: { tab: 'deploy' },
      })
    }

    // If no project found, redirect to projects list
    throw redirect({ to: '/projects' })
  },
})
