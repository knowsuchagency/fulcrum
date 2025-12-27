import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight03Icon, ArrowLeft03Icon, ArrowUp03Icon, Orbit01Icon, Menu01Icon, GitCommitIcon } from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitPush } from '@/hooks/use-git-push'
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
  terminalId?: string
  sendInputToTerminal?: (terminalId: string, text: string) => void
}

export function GitActionsButtons({
  repoPath,
  worktreePath,
  baseBranch,
  taskId,
  isMobile,
  terminalId,
  sendInputToTerminal,
}: GitActionsButtonsProps) {
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitPush = useGitPush()
  const gitSyncParent = useGitSyncParent()
  const updateTask = useUpdateTask()
  const killClaude = useKillClaudeInTask()

  const resolveWithClaude = (prompt: string) => {
    if (terminalId && sendInputToTerminal) {
      sendInputToTerminal(terminalId, prompt)
      toast.info('Sent to Claude Code')
    } else {
      toast.error('No terminal available')
    }
  }

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
      const branch = baseBranch || 'main'
      toast.error(errorMessage, {
        action: terminalId && sendInputToTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Rebase this worktree onto the parent repo's ${branch} branch. Error: "${errorMessage}". Steps: 1) Check for uncommitted changes - stash or commit them first, 2) git fetch origin (in parent repo at ${repoPath}) to ensure ${branch} is current, 3) git rebase ${branch} (in worktree), 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) If stashed, git stash pop. Worktree: ${worktreePath}, Parent repo: ${repoPath}.`
          ),
        } : undefined,
      })
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
      const branch = baseBranch || 'main'
      toast.error(errorMessage, {
        action: terminalId && sendInputToTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Merge this worktree's branch into the parent repo's ${branch}. Error: "${errorMessage}". Steps: 1) Ensure all changes in worktree are committed, 2) In parent repo at ${repoPath}, checkout ${branch} and pull latest from origin, 3) Merge the worktree branch into ${branch}, 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Push ${branch} to origin. Worktree: ${worktreePath}, Parent repo: ${repoPath}.`
          ),
        } : undefined,
      })
    }
  }

  const handlePush = async () => {
    try {
      await gitPush.mutateAsync({
        worktreePath,
      })
      toast.success('Pushed to origin')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Push failed'
      toast.error(errorMessage, {
        action: terminalId && sendInputToTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Push this worktree's branch to origin. Error: "${errorMessage}". Steps: 1) Check for uncommitted changes and commit them, 2) If push is rejected, pull the latest changes first and resolve any conflicts, 3) Push to origin again. Worktree: ${worktreePath}.`
          ),
        } : undefined,
      })
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
      const branch = baseBranch || 'main'
      toast.error(errorMessage, {
        action: terminalId && sendInputToTerminal ? {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Sync the parent repo's ${branch} branch with origin. Error: "${errorMessage}". Steps: 1) git fetch origin, 2) git pull origin ${branch} --ff-only, 3) If that fails, rebase with git rebase origin/${branch}, 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Once in sync, git push origin ${branch}. Work in the parent repo at ${repoPath}, not the worktree.`
          ),
        } : undefined,
      })
    }
  }

  const handleCommit = () => {
    if (terminalId && sendInputToTerminal) {
      sendInputToTerminal(terminalId, 'commit')
    }
  }

  const isPending = gitSync.isPending || gitMerge.isPending || gitPush.isPending || gitSyncParent.isPending

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
              icon={ArrowRight03Icon}
              size={12}
              strokeWidth={2}
              className={gitSync.isPending ? 'animate-spin' : ''}
            />
            Pull from main
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleMergeToMain} disabled={gitMerge.isPending}>
            <HugeiconsIcon
              icon={ArrowLeft03Icon}
              size={12}
              strokeWidth={2}
              className={gitMerge.isPending ? 'animate-pulse' : ''}
            />
            Merge to main
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePush} disabled={gitPush.isPending}>
            <HugeiconsIcon
              icon={ArrowUp03Icon}
              size={12}
              strokeWidth={2}
              className={gitPush.isPending ? 'animate-pulse' : ''}
            />
            Push to origin
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
          {terminalId && sendInputToTerminal && (
            <DropdownMenuItem onClick={handleCommit}>
              <HugeiconsIcon
                icon={GitCommitIcon}
                size={12}
                strokeWidth={2}
              />
              Commit
            </DropdownMenuItem>
          )}
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
          icon={ArrowRight03Icon}
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
          icon={ArrowLeft03Icon}
          size={12}
          strokeWidth={2}
          className={gitMerge.isPending ? 'animate-pulse' : ''}
        />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handlePush}
        disabled={gitPush.isPending}
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        title="Push to origin"
      >
        <HugeiconsIcon
          icon={ArrowUp03Icon}
          size={12}
          strokeWidth={2}
          className={gitPush.isPending ? 'animate-pulse' : ''}
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

      {terminalId && sendInputToTerminal && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCommit}
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Commit"
        >
          <HugeiconsIcon
            icon={GitCommitIcon}
            size={12}
            strokeWidth={2}
          />
        </Button>
      )}
    </>
  )
}
