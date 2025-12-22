import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  GridViewIcon,
  CommandLineIcon,
  Settings01Icon,
  FolderSyncIcon,
  Database01Icon,
  GitPullRequestIcon,
  BrowserIcon,
} from '@hugeicons/core-free-icons'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'

interface HeaderProps {
  onNewTaskRef?: (openModal: () => void) => void
  onOpenCommandPalette?: () => void
}

export function Header({ onNewTaskRef, onOpenCommandPalette }: HeaderProps) {
  const { location } = useRouterState()
  const pathname = location.pathname
  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  // Expose the open function to parent via callback ref pattern
  useEffect(() => {
    onNewTaskRef?.(() => setCreateTaskOpen(true))
  }, [onNewTaskRef])

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
          <Link to="/repositories">
            <Button
              variant={pathname.startsWith('/repositories') ? 'secondary' : 'ghost'}
              size="sm"
            >
              <HugeiconsIcon
                icon={Database01Icon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              Repositories
            </Button>
          </Link>
          <Link to="/review">
            <Button
              variant={pathname.startsWith('/review') ? 'secondary' : 'ghost'}
              size="sm"
            >
              <HugeiconsIcon
                icon={GitPullRequestIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              Review
            </Button>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <CreateTaskModal open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCommandPalette}
          title="Command Palette (⌘K)"
        >
          <HugeiconsIcon icon={BrowserIcon} size={16} strokeWidth={2} />
        </Button>
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
