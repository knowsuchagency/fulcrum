import { useRouterState } from '@tanstack/react-router'
import { Tiles } from '@/components/ui/tiles'

const ROUTES_WITH_BACKGROUND = ['/', '/tasks', '/terminals', '/worktrees', '/repositories', '/projects', '/review', '/monitoring', '/settings']

export function PageBackground() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Check if current route should have background
  const showBackground = ROUTES_WITH_BACKGROUND.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (!showBackground) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Amorphous gradient blobs */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 10%, var(--gradient-glow) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 30%, var(--gradient-glow) 0%, transparent 45%),
            radial-gradient(ellipse 70% 60% at 60% 90%, var(--gradient-glow) 0%, transparent 40%)
          `
        }}
      />
      <Tiles rows={100} cols={50} tileSize="sm" />
    </div>
  )
}
