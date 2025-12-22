import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown03Icon, ArrowUp03Icon, Orbit01Icon } from '@hugeicons/core-free-icons'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitSyncParent } from '@/hooks/use-git-sync-parent'
import { useUpdateTask } from '@/hooks/use-tasks'
import { toast } from 'sonner'

interface GitActionsButtonsProps {
  repoPath: string
  worktreePath: string
  baseBranch: string
  taskId: string
}

export function GitActionsButtons({
  repoPath,
  worktreePath,
  baseBranch,
  taskId,
}: GitActionsButtonsProps) {
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitSyncParent = useGitSyncParent()
  const updateTask = useUpdateTask()

  const handleSync = async () => {
    try {
      await gitSync.mutateAsync({
        repoPath,
        worktreePath,
        baseBranch,
      })
      toast.success('Synced from main')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      toast.error(errorMessage)
    }
  }

  const handleMergeToMain = async () => {
    try {
      await gitMerge.mutateAsync({
        repoPath,
        worktreePath,
        baseBranch,
      })
      toast.success('Merged to main')
      // Mark task as done after successful merge
      updateTask.mutate({
        taskId,
        updates: { status: 'DONE' },
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Merge failed'
      toast.error(errorMessage)
    }
  }

  const handleSyncParent = async () => {
    try {
      await gitSyncParent.mutateAsync({
        repoPath,
        baseBranch,
      })
      toast.success('Parent synced with origin')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync parent failed'
      toast.error(errorMessage)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleSync}
        disabled={gitSync.isPending}
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Pull from main"
      >
        <HugeiconsIcon
          icon={ArrowDown03Icon}
          size={12}
          strokeWidth={2}
          className={gitSync.isPending ? 'animate-spin' : ''}
        />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleMergeToMain}
        disabled={gitMerge.isPending}
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Merge to main"
      >
        <HugeiconsIcon
          icon={ArrowUp03Icon}
          size={12}
          strokeWidth={2}
          className={gitMerge.isPending ? 'animate-pulse' : ''}
        />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleSyncParent}
        disabled={gitSyncParent.isPending}
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Sync parent with origin"
      >
        <HugeiconsIcon
          icon={Orbit01Icon}
          size={12}
          strokeWidth={2}
          className={gitSyncParent.isPending ? 'animate-spin' : ''}
        />
      </Button>
    </>
  )
}
