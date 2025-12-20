import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
