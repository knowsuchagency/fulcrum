import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatShortcut } from '@/lib/keyboard'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShortcutItem {
  label: string
  shortcut: string
}

interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { label: 'Go to Tasks', shortcut: 'meta+1' },
      { label: 'Go to Terminals', shortcut: 'meta+2' },
      { label: 'Go to Worktrees', shortcut: 'meta+3' },
      { label: 'Go to Settings', shortcut: 'meta+,' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { label: 'Command Palette', shortcut: 'meta+k' },
      { label: 'New Task', shortcut: 'meta+n' },
      { label: 'Keyboard Shortcuts', shortcut: 'shift+meta+/' },
    ],
  },
  {
    title: 'General',
    items: [
      { label: 'Close Modal', shortcut: 'escape' },
    ],
  },
]

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.shortcut}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{item.label}</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      {formatShortcut(item.shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
