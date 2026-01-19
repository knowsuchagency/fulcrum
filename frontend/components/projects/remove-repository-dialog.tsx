import { useState } from 'react'
import { useRemoveRepositoryFromProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'

interface RemoveRepositoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  repository: {
    id: string
    displayName: string
    path: string
  } | null
}

export function RemoveRepositoryDialog({
  open,
  onOpenChange,
  projectId,
  repository,
}: RemoveRepositoryDialogProps) {
  const removeRepositoryMutation = useRemoveRepositoryFromProject()
  const [removeOption, setRemoveOption] = useState<'unlink' | 'delete'>('unlink')

  const handleRemove = async () => {
    if (!repository) return

    try {
      await removeRepositoryMutation.mutateAsync({
        projectId,
        repositoryId: repository.id,
        deleteRecord: removeOption === 'delete',
      })

      toast.success(
        removeOption === 'delete'
          ? 'Repository removed and deleted'
          : 'Repository unlinked from project'
      )
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to remove repository', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Repository</AlertDialogTitle>
          <AlertDialogDescription>
            Remove "{repository?.displayName}" from this project?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <RadioGroup
            value={removeOption}
            onValueChange={(v) => setRemoveOption(v as 'unlink' | 'delete')}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="unlink" id="unlink" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="unlink" className="font-medium cursor-pointer">
                  Just unlink from project
                </Label>
                <p className="text-xs text-muted-foreground">
                  Repository record will be kept (can be added to another project later)
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem value="delete" id="delete" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="delete" className="font-medium cursor-pointer">
                  Delete repository record
                </Label>
                <p className="text-xs text-muted-foreground">
                  Removes from project AND deletes the repository record (does not delete files on disk)
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeRepositoryMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removeRepositoryMutation.isPending}
          >
            {removeRepositoryMutation.isPending ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  strokeWidth={2}
                  className="animate-spin"
                />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
