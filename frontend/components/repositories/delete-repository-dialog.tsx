import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import type { Repository } from '@/types'

interface DeleteRepositoryDialogProps {
  repository: Repository | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (deleteDirectory: boolean) => Promise<void>
}

export function DeleteRepositoryDialog({
  repository,
  open,
  onOpenChange,
  onDelete,
}: DeleteRepositoryDialogProps) {
  const { t } = useTranslation('repositories')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDirectory, setDeleteDirectory] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(deleteDirectory)
      onOpenChange(false)
    } catch {
      // Keep dialog open on error
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      setDeleteDirectory(false) // Reset checkbox when dialog closes
    }
  }

  if (!repository) return null

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('delete.description', { name: repository.displayName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Delete directory checkbox */}
        <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <Checkbox
            id={`delete-dir-${repository.id}`}
            checked={deleteDirectory}
            onCheckedChange={(checked) => setDeleteDirectory(checked === true)}
            disabled={isDeleting}
            className="border-destructive/50 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive mt-0.5"
          />
          <div className="space-y-1">
            <label
              htmlFor={`delete-dir-${repository.id}`}
              className="text-sm font-medium leading-none cursor-pointer"
            >
              {t('delete.alsoDeleteDirectory')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('delete.deleteDirectoryWarning')}
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('addModal.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                strokeWidth={2}
                className="animate-spin"
              />
            )}
            {isDeleting ? t('delete.deleting') : t('delete.button')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
