import { useState, useEffect } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Bot } from 'lucide-react'
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
  TaskDaily01Icon,
  ComputerTerminal01Icon,
  Settings01Icon,
  PackageIcon,
  GitPullRequestIcon,
  BrowserIcon,
  Chart02Icon,
  More03Icon,
} from '@hugeicons/core-free-icons'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { useChat } from '@/hooks/use-chat'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onNewTaskRef?: (openModal: () => void) => void
  onOpenCommandPalette?: () => void
}

const NAV_ITEMS = [
  { to: '/tasks', icon: TaskDaily01Icon, labelKey: 'header.tasks', matchPrefix: true },
  { to: '/terminals', icon: ComputerTerminal01Icon, labelKey: 'header.terminals', matchPrefix: false },
  { to: '/assistant', icon: null, lucideIcon: Bot, labelKey: 'header.assistant', matchPrefix: true },
  { to: '/projects', icon: PackageIcon, labelKey: 'header.projects', matchPrefix: true },
  { to: '/review', icon: GitPullRequestIcon, labelKey: 'header.review', matchPrefix: true },
  { to: '/monitoring', icon: Chart02Icon, labelKey: 'header.monitoring', matchPrefix: true },
] as const

export function Header({ onNewTaskRef, onOpenCommandPalette }: HeaderProps) {
  const { t } = useTranslation('navigation')
  const { location } = useRouterState()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const pathname = location.pathname
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [menuValue, setMenuValue] = useState('')
  const { toggle: toggleChat, isOpen: isChatOpen } = useChat()

  const isActive = (to: string, matchPrefix: boolean) =>
    matchPrefix ? pathname.startsWith(to) : pathname === to

  // Expose the open function to parent via callback ref pattern
  useEffect(() => {
    onNewTaskRef?.(() => setCreateTaskOpen(true))
  }, [onNewTaskRef])

  return (
    <header
      className="sticky top-0 z-10 flex h-10 shrink-0 items-center justify-between border-b border-border px-4 max-sm:px-2"
      style={{
        background: 'var(--gradient-header)'
      }}
    >
      <div className="flex min-w-0 items-center gap-4 max-sm:gap-2">

        {/* Mobile navigation menu (hamburger) */}
        <NavigationMenu className="sm:hidden" value={menuValue} onValueChange={setMenuValue}>
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
                    onClick={() => setMenuValue('')}
                  >
                    {item.icon ? (
                      <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} />
                    ) : item.lucideIcon ? (
                      <item.lucideIcon className="size-4" />
                    ) : null}
                    {t(item.labelKey)}
                  </NavigationMenuLink>
                ))}
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Tablet/Desktop navigation */}
        <nav className="hidden items-center gap-1 sm:flex">
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
                  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground',
                  'after:origin-center after:transition-transform after:duration-200',
                  active ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
                )}
              >
                {item.icon ? (
                  <HugeiconsIcon
                    icon={item.icon}
                    size={16}
                    strokeWidth={2}
                    data-slot="icon"
                  />
                ) : item.lucideIcon ? (
                  <item.lucideIcon className="size-4" data-slot="icon" />
                ) : null}
                <span>{t(item.labelKey)}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CreateTaskModal open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
        {/* AI Chat Button - shown on mobile, hidden on desktop where floating button is used */}
        <button
          onClick={toggleChat}
          className="sm:hidden relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, var(--destructive) 0%, color-mix(in oklch, var(--destructive) 80%, black) 100%)'
              : 'linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 80%, black) 100%)',
            boxShadow: isDark
              ? '0 0 8px color-mix(in oklch, var(--destructive) 40%, transparent)'
              : '0 0 8px color-mix(in oklch, var(--accent) 40%, transparent)',
          }}
          title="AI Assistant"
        >
          <Bot className={`w-4 h-4 text-white transition-transform ${isChatOpen ? 'rotate-12' : ''}`} />
          {!isChatOpen && (
            <div className={`absolute inset-0 rounded-full animate-pulse opacity-30 ${isDark ? 'bg-destructive' : 'bg-accent'}`} />
          )}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCommandPalette}
          title={t('header.commandPalette', { shortcut: '⌘K' })}
          className="hidden sm:inline-flex"
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
            'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground',
            'after:origin-center after:transition-transform after:duration-200',
            pathname === '/settings' ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
          )}
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={2} />
        </Link>
      </div>
    </header>
  )
}
