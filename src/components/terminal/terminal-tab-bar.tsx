import { useRef, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Cancel01Icon, Folder01Icon } from '@hugeicons/core-free-icons'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import type { TerminalTab } from '@/types'
import { cn } from '@/lib/utils'

interface TerminalTabBarProps {
  tabs: TerminalTab[]
  activeTabId: string
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabCreate: () => void
  onTabEdit: (tab: TerminalTab) => void
  onTabReorder?: (tabId: string, newPosition: number) => void
}

interface DraggableTabProps {
  tab: TerminalTab
  isActive: boolean
  canClose: boolean
  onSelect: () => void
  onClose: () => void
  onEdit: () => void
  onReorder?: (tabId: string, newPosition: number) => void
}

function DraggableTab({
  tab,
  isActive,
  canClose,
  onSelect,
  onClose,
  onEdit,
  onReorder,
}: DraggableTabProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const hasDragged = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !onReorder) return

    return combine(
      draggable({
        element: el,
        getInitialData: () => ({
          type: 'terminal-tab',
          tabId: tab.id,
          position: tab.position,
        }),
        onDragStart: () => {
          setIsDragging(true)
          hasDragged.current = true
        },
        onDrop: () => {
          setIsDragging(false)
        },
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, element }) => {
          const data = {
            type: 'terminal-tab',
            tabId: tab.id,
            position: tab.position,
          }
          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ['left', 'right'],
          })
        },
        canDrop: ({ source }) => {
          return source.data.type === 'terminal-tab' && source.data.tabId !== tab.id
        },
        onDragEnter: ({ self }) => {
          setClosestEdge(extractClosestEdge(self.data))
        },
        onDrag: ({ self }) => {
          setClosestEdge(extractClosestEdge(self.data))
        },
        onDragLeave: () => {
          setClosestEdge(null)
        },
        onDrop: ({ source, self }) => {
          setClosestEdge(null)
          const edge = extractClosestEdge(self.data)
          const sourceTabId = source.data.tabId as string
          const targetPosition = tab.position

          // Calculate new position based on drop edge
          let newPosition: number
          if (edge === 'left') {
            newPosition = targetPosition
          } else {
            newPosition = targetPosition + 1
          }

          onReorder(sourceTabId, newPosition)
        },
      })
    )
  }, [tab.id, tab.position, onReorder])

  const handlePointerDown = () => {
    hasDragged.current = false
  }

  const handleClick = () => {
    if (!hasDragged.current) {
      onSelect()
    }
    hasDragged.current = false
  }

  return (
    <button
      ref={ref}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={onEdit}
      onContextMenu={(e) => {
        e.preventDefault()
        onEdit()
      }}
      className={cn(
        'group relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors max-sm:px-2 max-sm:py-1',
        isActive
          ? 'bg-background text-foreground'
          : 'text-muted-foreground hover:text-foreground',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:transition-opacity',
        isActive ? 'after:opacity-100' : 'after:opacity-0',
        isDragging && 'opacity-50',
        onReorder && 'cursor-grab active:cursor-grabbing'
      )}
      title={tab.directory ? `${tab.name}\n${tab.directory}` : tab.name}
    >
      {/* Drop indicator */}
      {closestEdge && (
        <div
          className={cn(
            'absolute top-0 bottom-0 w-0.5 bg-primary z-10',
            closestEdge === 'left' && '-left-1',
            closestEdge === 'right' && '-right-1'
          )}
        />
      )}

      {tab.directory && (
        <HugeiconsIcon
          icon={Folder01Icon}
          size={12}
          strokeWidth={2}
          className="shrink-0 opacity-60"
        />
      )}
      {tab.name}
      {canClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          onPointerDown={(e) => e.stopPropagation()}
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
  )
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabCreate,
  onTabEdit,
  onTabReorder,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <DraggableTab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          canClose={tabs.length > 1}
          onSelect={() => onTabSelect(tab.id)}
          onClose={() => onTabClose(tab.id)}
          onEdit={() => onTabEdit(tab)}
          onReorder={onTabReorder}
        />
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
