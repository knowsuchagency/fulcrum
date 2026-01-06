import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchJSON } from '@/lib/api'
import type { ProjectWithDetails } from '@/types'

/**
 * Legacy route: /repositories/$repoId
 * Redirects to /projects/$projectId where the project contains this repository
 */
export const Route = createFileRoute('/repositories/$repoId')({
  loader: async ({ params }) => {
    // Find the project that contains this repository
    const projects = await fetchJSON<ProjectWithDetails[]>('/api/projects')
    const project = projects.find((p) => p.repository?.id === params.repoId)

    if (project) {
      throw redirect({
        to: '/projects/$projectId',
        params: { projectId: project.id },
      })
    }

    // If no project found, redirect to projects list
    throw redirect({ to: '/projects' })
  },
})
