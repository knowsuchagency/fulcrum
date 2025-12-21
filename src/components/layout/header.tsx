import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { GridViewIcon, CommandLineIcon, Settings01Icon, FolderSyncIcon } from '@hugeicons/core-free-icons'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'

export function Header() {
  const { location } = useRouterState()
  const pathname = location.pathname

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-black px-4">
      <div className="flex items-center gap-4">
        <Link to="/tasks" className="flex items-center">
          <img src="/vibora-logo.jpeg" alt="Vibora" className="h-7" />
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/tasks">
            <Button
              variant={pathname.startsWith('/tasks') ? 'secondary' : 'ghost'}
              size="sm"
            >
              <HugeiconsIcon
                icon={GridViewIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              Tasks
            </Button>
          </Link>
          <Link to="/terminals">
            <Button
              variant={pathname === '/terminals' ? 'secondary' : 'ghost'}
              size="sm"
            >
              <HugeiconsIcon
                icon={CommandLineIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              Terminals
            </Button>
          </Link>
          <Link to="/worktrees">
            <Button
              variant={pathname.startsWith('/worktrees') ? 'secondary' : 'ghost'}
              size="sm"
            >
              <HugeiconsIcon
                icon={FolderSyncIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              Worktrees
            </Button>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <CreateTaskModal />
        <Link to="/settings">
          <Button
            variant={pathname === '/settings' ? 'secondary' : 'ghost'}
            size="icon-sm"
          >
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={2} />
          </Button>
        </Link>
      </div>
    </header>
  )
}
