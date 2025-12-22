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
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-black px-4">
      <div className="flex items-center gap-4">
        <Link to="/tasks" className="hidden items-center sm:flex">
          <img src="/vibora-logo.jpeg" alt="Vibora" className="h-7" />
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/tasks">
            <Button
              variant={pathname.startsWith('/tasks') ? 'secondary' : 'ghost'}
              size="sm"
              className="max-sm:px-2"
            >
              <HugeiconsIcon
                icon={GridViewIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              <span className="max-sm:hidden">Tasks</span>
            </Button>
          </Link>
          <Link to="/terminals">
            <Button
              variant={pathname === '/terminals' ? 'secondary' : 'ghost'}
              size="sm"
              className="max-sm:px-2"
            >
              <HugeiconsIcon
                icon={CommandLineIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              <span className="max-sm:hidden">Terminals</span>
            </Button>
          </Link>
          <Link to="/worktrees">
            <Button
              variant={pathname.startsWith('/worktrees') ? 'secondary' : 'ghost'}
              size="sm"
              className="max-sm:px-2"
            >
              <HugeiconsIcon
                icon={FolderSyncIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              <span className="max-sm:hidden">Worktrees</span>
            </Button>
          </Link>
          <Link to="/repositories">
            <Button
              variant={pathname.startsWith('/repositories') ? 'secondary' : 'ghost'}
              size="sm"
              className="max-sm:px-2"
            >
              <HugeiconsIcon
                icon={Database01Icon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              <span className="max-sm:hidden">Repositories</span>
            </Button>
          </Link>
          <Link to="/review">
            <Button
              variant={pathname.startsWith('/review') ? 'secondary' : 'ghost'}
              size="sm"
              className="max-sm:px-2"
            >
              <HugeiconsIcon
                icon={GitPullRequestIcon}
                size={16}
                strokeWidth={2}
                data-slot="icon"
              />
              <span className="max-sm:hidden">Review</span>
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
