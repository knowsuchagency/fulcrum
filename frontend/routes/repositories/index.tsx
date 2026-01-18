import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy route: /repositories
 * Redirects to /projects?tab=repositories
 */
export const Route = createFileRoute('/repositories/')({
  beforeLoad: () => {
    throw redirect({
      to: '/projects',
      search: { tab: 'repositories' },
    })
  },
  component: () => null,
})
