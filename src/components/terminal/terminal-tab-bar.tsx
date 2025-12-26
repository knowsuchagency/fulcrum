import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Cancel01Icon, Folder01Icon } from '@hugeicons/core-free-icons'
import type { TerminalTab } from '@/types'
import { cn } from '@/lib/utils'

interface TerminalTabBarProps {
  tabs: TerminalTab[]
  activeTabId: string
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabCreate: () => void
  onTabEdit: (tab: TerminalTab) => void
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabCreate,
  onTabEdit,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          onDoubleClick={() => onTabEdit(tab)}
          className={cn(
            'group relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors max-sm:px-2 max-sm:py-1',
            tab.id === activeTabId
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
            'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-opacity',
            tab.id === activeTabId ? 'after:opacity-100' : 'after:opacity-0'
          )}
          title={tab.directory ? `${tab.name}\n${tab.directory}` : tab.name}
        >
          {tab.directory && (
            <HugeiconsIcon
              icon={Folder01Icon}
              size={12}
              strokeWidth={2}
              className="shrink-0 opacity-60"
            />
          )}
          {tab.name}
          {tabs.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
              className="ml-1 rounded opacity-0 hover:bg-muted group-hover:opacity-100"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                size={12}
                strokeWidth={2}
              />
            </button>
          )}
        </button>
      ))}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onTabCreate}
        className="ml-1"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
      </Button>
    </div>
  )
}
