import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HugeiconsIcon } from '@hugeicons/react'
import { LayoutLeftIcon } from '@hugeicons/core-free-icons'
import type { TerminalLayout } from '@/types'

interface LayoutSelectorProps {
  currentLayout: TerminalLayout
  onLayoutChange: (layout: TerminalLayout) => void
}

const LAYOUTS: { value: TerminalLayout; label: string; icon: string }[] = [
  { value: 'single', label: 'Single', icon: '[  ]' },
  { value: 'split-h', label: 'Split Horizontal', icon: '[ | ]' },
  { value: 'split-v', label: 'Split Vertical', icon: '[---]' },
  { value: 'triple', label: 'Triple', icon: '[ |=]' },
  { value: 'quad', label: 'Quad', icon: '[+]' },
]

export function LayoutSelector({
  currentLayout,
  onLayoutChange,
}: LayoutSelectorProps) {
  const currentLayoutInfo = LAYOUTS.find((l) => l.value === currentLayout)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <HugeiconsIcon
          icon={LayoutLeftIcon}
          size={14}
          strokeWidth={2}
          data-slot="icon"
        />
        <span className="font-mono text-xs">{currentLayoutInfo?.icon}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={currentLayout}
          onValueChange={(v) => onLayoutChange(v as TerminalLayout)}
        >
          {LAYOUTS.map((layout) => (
            <DropdownMenuRadioItem key={layout.value} value={layout.value}>
              <span className="mr-2 font-mono text-xs text-muted-foreground">
                {layout.icon}
              </span>
              {layout.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
