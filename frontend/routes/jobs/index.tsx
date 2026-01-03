import { createFileRoute, redirect } from '@tanstack/react-router'

// Redirect /jobs to /monitoring?tab=jobs
export const Route = createFileRoute('/jobs/')({
  beforeLoad: () => {
    throw redirect({ to: '/monitoring', search: { tab: 'jobs' } })
  },
  component: () => null,
})
