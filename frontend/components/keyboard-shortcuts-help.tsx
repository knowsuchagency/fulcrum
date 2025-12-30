import { useTranslation } from 'react-i18next'
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
  labelKey: string
  shortcut: string
}

interface ShortcutGroup {
  titleKey: string
  items: ShortcutItem[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    titleKey: 'navigation',
    items: [
      { labelKey: 'goToTasks', shortcut: 'meta+1' },
      { labelKey: 'goToTerminals', shortcut: 'meta+2' },
      { labelKey: 'goToTaskTerminals', shortcut: 'meta+i' },
      { labelKey: 'goToRepositories', shortcut: 'meta+3' },
      { labelKey: 'goToReview', shortcut: 'meta+4' },
      { labelKey: 'goToMonitoring', shortcut: 'meta+5' },
      { labelKey: 'goToSettings', shortcut: 'meta+,' },
    ],
  },
  {
    titleKey: 'actions',
    items: [
      { labelKey: 'commandPalette', shortcut: 'meta+k' },
      { labelKey: 'newTask', shortcut: 'meta+j' },
      { labelKey: 'keyboardShortcuts', shortcut: 'meta+/' },
    ],
  },
  {
    titleKey: 'terminals',
    items: [
      { labelKey: 'newTerminal', shortcut: 'meta+d' },
      { labelKey: 'closeTerminal', shortcut: 'meta+w' },
    ],
  },
  {
    titleKey: 'general',
    items: [
      { labelKey: 'closeModal', shortcut: 'escape' },
      { labelKey: 'submitForm', shortcut: 'meta+enter' },
    ],
  },
]

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation('navigation')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {shortcutGroups.map((group) => (
            <div key={group.titleKey}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                {t(`shortcuts.groups.${group.titleKey}`)}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.shortcut}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{t(`shortcuts.labels.${item.labelKey}`)}</span>
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
