import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/new')({
  component: NewProjectView,
})

function NewProjectView() {
  return <div>New Project View (TODO)</div>
}
