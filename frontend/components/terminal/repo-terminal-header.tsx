import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { FolderLibraryIcon, Maximize02Icon, ArrowShrink02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface RepoInfo {
  repoId: string
  repoName: string
  repoPath: string
}

interface RepoTerminalHeaderProps {
  repoInfo: RepoInfo
  isMaximized?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
  canMaximize?: boolean
}

export function RepoTerminalHeader({ repoInfo, isMaximized, onMaximize, onMinimize, canMaximize }: RepoTerminalHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-card">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
        {/* Repository link */}
        <Link
          to="/repositories/$repoId"
          params={{ repoId: repoInfo.repoId }}
          className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 max-w-[50%]"
        >
          <HugeiconsIcon icon={FolderLibraryIcon} size={12} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{repoInfo.repoName}</span>
        </Link>

        {/* Repository path */}
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground truncate">
          {repoInfo.repoPath}
        </span>
      </div>
      {canMaximize && (
        <div className="flex items-center gap-1 mr-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={isMaximized ? onMinimize : onMaximize}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <HugeiconsIcon
              icon={isMaximized ? ArrowShrink02Icon : Maximize02Icon}
              size={12}
              strokeWidth={2}
            />
          </Button>
        </div>
      )}
    </div>
  )
}
