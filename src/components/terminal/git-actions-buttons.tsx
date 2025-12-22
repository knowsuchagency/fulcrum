import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown03Icon, ArrowUp03Icon, Orbit01Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitSyncParent } from '@/hooks/use-git-sync-parent'
import { useUpdateTask } from '@/hooks/use-tasks'
import { useKillClaudeInTask } from '@/hooks/use-kill-claude'
import { toast } from 'sonner'

interface GitActionsButtonsProps {
  repoPath: string
  worktreePath: string
  baseBranch: string
  taskId: string
  isMobile?: boolean
}

export function GitActionsButtons({
  repoPath,
  worktreePath,
  baseBranch,
  taskId,
  isMobile,
}: GitActionsButtonsProps) {
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitSyncParent = useGitSyncParent()
  const updateTask = useUpdateTask()
  const killClaude = useKillClaudeInTask()

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
      // Kill Claude if running in the task's terminals
      killClaude.mutate(taskId)
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

  const isPending = gitSync.isPending || gitMerge.isPending || gitSyncParent.isPending

  if (isMobile) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={Menu01Icon}
            size={12}
            strokeWidth={2}
            className={isPending ? 'animate-pulse' : ''}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSync} disabled={gitSync.isPending}>
            <HugeiconsIcon
              icon={ArrowDown03Icon}
              size={12}
              strokeWidth={2}
              className={gitSync.isPending ? 'animate-spin' : ''}
            />
            Pull from main
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleMergeToMain} disabled={gitMerge.isPending}>
            <HugeiconsIcon
              icon={ArrowUp03Icon}
              size={12}
              strokeWidth={2}
              className={gitMerge.isPending ? 'animate-pulse' : ''}
            />
            Merge to main
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSyncParent} disabled={gitSyncParent.isPending}>
            <HugeiconsIcon
              icon={Orbit01Icon}
              size={12}
              strokeWidth={2}
              className={gitSyncParent.isPending ? 'animate-spin' : ''}
            />
            Sync parent with origin
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
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
