import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  GridViewIcon,
  CommandLineIcon,
  Settings01Icon,
  FolderSyncIcon,
  Database01Icon,
  GitPullRequestIcon,
  BrowserIcon,
  ChartLineData01Icon,
  More03Icon,
} from '@hugeicons/core-free-icons'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onNewTaskRef?: (openModal: () => void) => void
  onOpenCommandPalette?: () => void
}

const NAV_ITEMS = [
  { to: '/tasks', icon: GridViewIcon, labelKey: 'header.tasks', matchPrefix: true },
  { to: '/terminals', icon: CommandLineIcon, labelKey: 'header.terminals', matchPrefix: false },
  { to: '/worktrees', icon: FolderSyncIcon, labelKey: 'header.worktrees', matchPrefix: true },
  { to: '/repositories', icon: Database01Icon, labelKey: 'header.repositories', matchPrefix: true },
  { to: '/review', icon: GitPullRequestIcon, labelKey: 'header.review', matchPrefix: true },
  { to: '/monitoring', icon: ChartLineData01Icon, labelKey: 'header.monitoring', matchPrefix: true },
] as const

export function Header({ onNewTaskRef, onOpenCommandPalette }: HeaderProps) {
  const { t } = useTranslation('navigation')
  const { location } = useRouterState()
  const pathname = location.pathname
  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  const isActive = (to: string, matchPrefix: boolean) =>
    matchPrefix ? pathname.startsWith(to) : pathname === to

  // Expose the open function to parent via callback ref pattern
  useEffect(() => {
    onNewTaskRef?.(() => setCreateTaskOpen(true))
  }, [onNewTaskRef])

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4 max-sm:px-2">
      <div className="flex min-w-0 items-center gap-4 max-sm:gap-2">

        {/* Mobile navigation menu */}
        <NavigationMenu className="lg:hidden">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50 gap-1 px-2">
                <HugeiconsIcon icon={More03Icon} size={16} strokeWidth={2} />
                <span className="sr-only">Menu</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="min-w-48">
                {NAV_ITEMS.map((item) => (
                  <NavigationMenuLink
                    key={item.to}
                    href={item.to}
                    active={isActive(item.to, item.matchPrefix)}
                    render={<Link to={item.to} />}
                  >
                    <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} />
                    {t(item.labelKey)}
                  </NavigationMenuLink>
                ))}
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to, item.matchPrefix)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors',
                  active
                    ? 'bg-background text-foreground'
                    : 'text-foreground/60 hover:text-foreground',
                  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-opacity',
                  active ? 'after:opacity-100' : 'after:opacity-0'
                )}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={16}
                  strokeWidth={2}
                  data-slot="icon"
                />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CreateTaskModal open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCommandPalette}
          title={t('header.commandPalette', { shortcut: '⌘K' })}
        >
          <HugeiconsIcon icon={BrowserIcon} size={16} strokeWidth={2} />
        </Button>
        <Link
          to="/settings"
          className={cn(
            'relative flex items-center justify-center rounded-md p-1.5 transition-colors',
            pathname === '/settings'
              ? 'bg-background text-foreground'
              : 'text-foreground/60 hover:text-foreground',
            'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-opacity',
            pathname === '/settings' ? 'after:opacity-100' : 'after:opacity-0'
          )}
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={2} />
        </Link>
      </div>
    </header>
  )
}
