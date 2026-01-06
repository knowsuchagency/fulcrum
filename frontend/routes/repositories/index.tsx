import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy route: /repositories
 * Redirects to /projects - repositories are now managed within projects
 */
export const Route = createFileRoute('/repositories/')({
  beforeLoad: () => {
    throw redirect({ to: '/projects' })
  },
})
