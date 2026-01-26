import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon, Alert02Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { useGitStatus } from '@/hooks/use-filesystem'

interface GitStatusBadgeProps {
  worktreePath: string | null
}

export function GitStatusBadge({ worktreePath }: GitStatusBadgeProps) {
  const { data: status, isLoading } = useGitStatus(worktreePath)

  if (!worktreePath || isLoading || !status) {
    return null
  }

  if (status.clean) {
    return (
      <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-transparent">
        <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
        Clean
      </Badge>
    )
  }

  const changeCount = status.files.length
  return (
    <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-transparent">
      <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2} />
      {changeCount} {changeCount === 1 ? 'change' : 'changes'}
    </Badge>
  )
}
