import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy route: /apps
 * Redirects to /projects - apps are now managed within projects
 */
export const Route = createFileRoute('/apps/')({
  beforeLoad: () => {
    throw redirect({ to: '/projects' })
  },
})
