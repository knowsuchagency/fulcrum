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
      {/* Lava lamp style animated blobs in each corner */}
      <div className="absolute inset-0 blur-3xl">
        <div
          className="absolute w-[40%] h-[50%] animate-blob-1"
          style={{
            background: 'var(--gradient-glow)',
            left: '0%',
            top: '0%',
          }}
        />
        <div
          className="absolute w-[35%] h-[45%] animate-blob-2"
          style={{
            background: 'var(--gradient-glow)',
            right: '0%',
            top: '0%',
          }}
        />
        <div
          className="absolute w-[38%] h-[48%] animate-blob-3"
          style={{
            background: 'var(--gradient-glow)',
            left: '0%',
            bottom: '0%',
          }}
        />
        <div
          className="absolute w-[42%] h-[45%] animate-blob-4"
          style={{
            background: 'var(--gradient-glow)',
            right: '0%',
            bottom: '0%',
          }}
        />
      </div>
      <Tiles rows={100} cols={50} tileSize="sm" />
    </div>
  )
}
