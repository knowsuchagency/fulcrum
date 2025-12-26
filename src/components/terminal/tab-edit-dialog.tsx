import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import type { TerminalTab } from '@/types'

interface TabEditDialogProps {
  tab: TerminalTab | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (tabId: string, updates: { name?: string; directory?: string | null }) => void
}

export function TabEditDialog({
  tab,
  open,
  onOpenChange,
  onSave,
}: TabEditDialogProps) {
  const { t } = useTranslation('terminals')
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState<string | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)

  // Reset form when dialog opens with a new tab
  useEffect(() => {
    if (open && tab) {
      setName(tab.name)
      setDirectory(tab.directory ?? null)
    }
  }, [open, tab])

  const handleSave = () => {
    if (!tab) return

    const updates: { name?: string; directory?: string | null } = {}

    if (name.trim() && name.trim() !== tab.name) {
      updates.name = name.trim()
    }

    if (directory !== (tab.directory ?? null)) {
      updates.directory = directory
    }

    // Only save if there are changes
    if (Object.keys(updates).length > 0) {
      onSave(tab.id, updates)
    }

    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  const handleClearDirectory = () => {
    setDirectory(null)
  }

  const handleSelectDirectory = (path: string) => {
    setDirectory(path)
  }

  const folderName = directory ? directory.split('/').pop() : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editTab.title')}</DialogTitle>
          </DialogHeader>

          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="tabName">{t('editTab.name')}</FieldLabel>
              <Input
                id="tabName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('editTab.namePlaceholder')}
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>{t('editTab.directory')}</FieldLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 justify-start font-normal"
                  onClick={() => setBrowserOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={14}
                    strokeWidth={2}
                    className="mr-2 shrink-0"
                  />
                  {folderName ? (
                    <span className="truncate font-mono text-xs">{directory}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('editTab.directoryPlaceholder')}</span>
                  )}
                </Button>
                {directory && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleClearDirectory}
                    title={t('editTab.clearDirectory')}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                  </Button>
                )}
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t('editTab.cancel')}
            </DialogClose>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {t('editTab.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handleSelectDirectory}
        initialPath={directory ?? undefined}
      />
    </>
  )
}
