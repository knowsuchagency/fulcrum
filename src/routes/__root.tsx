import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { useTaskSync } from '@/hooks/use-task-sync'

export const Route = createRootRoute({
  component: RootLayout,
})

function TaskSync() {
  useTaskSync()
  return null
}

function RootLayout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TaskSync />
      <Header />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
