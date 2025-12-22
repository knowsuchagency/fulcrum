import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Cancel01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import type { TerminalTab } from '@/types'
import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

interface TerminalTabBarProps {
  tabs: TerminalTab[]
  activeTabId: string
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabCreate: () => void
  onTabRename: (tabId: string, name: string) => void
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabCreate,
  onTabRename,
}: TerminalTabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = (tab: TerminalTab) => {
    setEditingTabId(tab.id)
    setEditValue(tab.name)
  }

  const handleRename = () => {
    if (editingTabId && editValue.trim()) {
      onTabRename(editingTabId, editValue.trim())
    }
    setEditingTabId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab)}
          className={cn(
            'group relative flex items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-xs transition-colors max-sm:px-2 max-sm:py-1',
            tab.id === activeTabId
              ? 'border-border bg-background text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {editingTabId === tab.id ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="h-5 w-20 px-1 text-xs"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleRename}
                className="h-4 w-4"
              >
                <HugeiconsIcon icon={Tick01Icon} size={12} strokeWidth={2} />
              </Button>
            </div>
          ) : (
            <>
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
            </>
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
