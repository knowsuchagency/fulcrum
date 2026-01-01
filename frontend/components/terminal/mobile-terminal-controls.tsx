import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowUp01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-is-mobile'

interface MobileTerminalControlsProps {
  onSend: (data: string) => void
}

const KEYS = [
  { label: 'Esc', icon: Cancel01Icon, data: '\x1b' },
  { label: 'Up', icon: ArrowUp01Icon, data: '\x1b[A' },
  { label: 'Down', icon: ArrowDown01Icon, data: '\x1b[B' },
  { label: 'Tab', icon: null, data: '\t' },
  { label: 'Enter', icon: null, data: '\r' },
] as const

export function MobileTerminalControls({ onSend }: MobileTerminalControlsProps) {
  const isMobile = useIsMobile()

  if (!isMobile) return null

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-3 py-2">
      {KEYS.map((key) => (
        <Button
          key={key.label}
          variant="outline"
          className="h-11 min-w-11 touch-manipulation"
          onClick={() => onSend(key.data)}
        >
          {key.icon ? (
            <HugeiconsIcon icon={key.icon} size={20} strokeWidth={2} />
          ) : (
            <span className="text-xs font-medium">{key.label}</span>
          )}
          <span className="sr-only">{key.label}</span>
        </Button>
      ))}
    </div>
  )
}
