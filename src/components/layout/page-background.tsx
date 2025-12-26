import { useRouterState } from '@tanstack/react-router'
import { Tiles } from '@/components/ui/tiles'

const ROUTES_WITH_BACKGROUND = ['/', '/tasks', '/terminals', '/worktrees', '/repositories', '/review', '/monitoring', '/settings']

export function PageBackground() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Check if current route should have background
  const showBackground = ROUTES_WITH_BACKGROUND.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (!showBackground) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <Tiles rows={100} cols={50} tileSize="sm" />
    </div>
  )
}
