import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Menu01Icon,
  ArrowRight03Icon,
  ArrowLeft03Icon,
  ArrowUp03Icon,
  Orbit01Icon,
  GitCommitIcon,
  GitPullRequestIcon,
  PackageIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useGitSync } from '@/hooks/use-git-sync'
import { useGitMergeToMain } from '@/hooks/use-git-merge'
import { useGitPush } from '@/hooks/use-git-push'
import { useGitSyncParent } from '@/hooks/use-git-sync-parent'
import { useGitCreatePR } from '@/hooks/use-git-create-pr'
import { useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useKillClaudeInTask } from '@/hooks/use-kill-claude'
import { openExternalUrl } from '@/lib/editor-url'
import { toast } from 'sonner'

interface TaskActionsDropdownProps {
  repoPath: string
  worktreePath: string
  baseBranch: string
  taskId: string
  title: string
  prUrl?: string | null
  repoId?: string
  repoName: string
  terminalId?: string
  sendInputToTerminal?: (terminalId: string, text: string) => void
}

export function TaskActionsDropdown({
  repoPath,
  worktreePath,
  baseBranch,
  taskId,
  title,
  prUrl,
  repoId,
  repoName,
  terminalId,
  sendInputToTerminal,
}: TaskActionsDropdownProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const gitSync = useGitSync()
  const gitMerge = useGitMergeToMain()
  const gitPush = useGitPush()
  const gitSyncParent = useGitSyncParent()
  const gitCreatePR = useGitCreatePR()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const killClaude = useKillClaudeInTask()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const resolveWithClaude = (prompt: string) => {
    if (terminalId && sendInputToTerminal) {
      sendInputToTerminal(terminalId, prompt)
      toast.info(t('git.sentToClaude'))
    } else {
      toast.error(t('git.noTerminal'))
    }
  }

  const handleSync = async () => {
    try {
      await gitSync.mutateAsync({
        repoPath,
        worktreePath,
        baseBranch,
      })
      toast.success(t('git.syncedFromMain'))
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
      toast.success(t('git.mergedToMain'))
      killClaude.mutate(taskId)
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
            `Merge this worktree's branch into the parent repo's ${branch}. Error: "${errorMessage}". Steps: 1) Ensure all changes in worktree are committed, 2) In parent repo at ${repoPath}, checkout ${branch} and pull latest from origin, 3) Squash merge the worktree branch into ${branch} (use git merge --squash, then commit), 4) Resolve any conflicts carefully - do not lose functionality or introduce regressions, 5) Push ${branch} to origin. Worktree: ${worktreePath}, Parent repo: ${repoPath}.`
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
      toast.success(t('git.pushedToOrigin'))
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
      toast.success(t('git.parentSynced'))
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

  const handleNavigateToRepo = () => {
    if (repoId) {
      navigate({ to: '/repositories/$repoId', params: { repoId } })
    } else {
      navigate({ to: '/repositories' })
    }
  }

  const handleDeleteTask = () => {
    deleteTask.mutate({ taskId, deleteLinkedWorktree: true })
    setShowDeleteDialog(false)
  }

  const handleCreatePR = async () => {
    try {
      const result = await gitCreatePR.mutateAsync({
        worktreePath,
        title,
        baseBranch,
      })
      // Auto-link PR to task
      updateTask.mutate({
        taskId,
        updates: { prUrl: result.prUrl },
      })
      toast.success(t('git.prCreated'), {
        action: {
          label: 'View PR',
          onClick: () => openExternalUrl(result.prUrl),
        },
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create PR'
      // Check if PR already exists and we have the URL
      const existingPrUrl = err && typeof err === 'object' && 'existingPrUrl' in err
        ? (err as { existingPrUrl?: string }).existingPrUrl
        : undefined
      if (existingPrUrl) {
        // Auto-link the existing PR
        updateTask.mutate({
          taskId,
          updates: { prUrl: existingPrUrl },
        })
        toast.info(t('git.prExists'), {
          action: {
            label: 'View PR',
            onClick: () => openExternalUrl(existingPrUrl),
          },
        })
        return
      }
      // Show short error in toast, send full error to Claude
      const shortError = errorMessage.split('\n').filter(Boolean).pop() || errorMessage
      toast.error(shortError, {
        action: {
          label: 'Resolve with Claude',
          onClick: () => resolveWithClaude(
            `Create a PR for this task. Error: "${errorMessage}". After creating, link it using: vibora current-task pr <url>. Worktree: ${worktreePath}.`
          ),
        },
      })
    }
  }

  const isPending = gitSync.isPending || gitMerge.isPending || gitPush.isPending || gitSyncParent.isPending || gitCreatePR.isPending

  return (
    <>
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
          {!prUrl && (
            <DropdownMenuItem onClick={handleCreatePR} disabled={gitCreatePR.isPending}>
              <HugeiconsIcon
                icon={GitPullRequestIcon}
                size={12}
                strokeWidth={2}
                className={gitCreatePR.isPending ? 'animate-pulse' : ''}
              />
              Create PR
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleNavigateToRepo}>
            <HugeiconsIcon
              icon={PackageIcon}
              size={12}
              strokeWidth={2}
            />
            {repoName}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteTask.isPending}
            className="text-destructive focus:text-destructive"
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              size={12}
              strokeWidth={2}
            />
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this task and its worktree.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              variant="destructive"
              disabled={deleteTask.isPending}
            >
              {deleteTask.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
