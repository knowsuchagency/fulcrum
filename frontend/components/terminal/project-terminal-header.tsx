import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { PackageIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface ProjectInfo {
  projectId: string
  projectName: string
  repoPath: string
  appStatus: string | null
}

interface ProjectTerminalHeaderProps {
  projectInfo: ProjectInfo
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'building':
      return 'bg-yellow-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-muted-foreground/30'
  }
}

export function ProjectTerminalHeader({ projectInfo }: ProjectTerminalHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-card">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
        {/* Project link */}
        <Link
          to="/projects/$projectId"
          params={{ projectId: projectInfo.projectId }}
          search={{ tab: 'workspace' }}
          className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 max-w-[50%]"
        >
          <HugeiconsIcon icon={PackageIcon} size={12} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{projectInfo.projectName}</span>
        </Link>

        {/* Repository path */}
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground truncate">
          {projectInfo.repoPath}
        </span>

        {/* App status indicator */}
        {projectInfo.appStatus && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', getStatusColor(projectInfo.appStatus))} />
            <span className="text-xs text-muted-foreground capitalize">{projectInfo.appStatus}</span>
          </div>
        )}
      </div>
    </div>
  )
}
