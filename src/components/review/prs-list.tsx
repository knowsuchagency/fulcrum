import { useGitHubPRs, type GitHubPR, type PRFilter } from '@/hooks/use-github'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface Props {
  filter: PRFilter
  viboraReposOnly: boolean
  org?: string
}

export function PRsList({ filter, viboraReposOnly, org }: Props) {
  const { data: prs, isLoading, error } = useGitHubPRs(filter, viboraReposOnly, org)

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <HugeiconsIcon icon={Alert02Icon} size={24} />
        <p className="text-sm">Failed to load pull requests</p>
        <p className="text-xs">{error.message}</p>
      </div>
    )
  }

  const emptyMessages: Record<PRFilter, string> = {
    all: 'No open pull requests',
    created: 'No pull requests created by you',
    assigned: 'No pull requests assigned to you',
    review_requested: 'No pull requests awaiting your review',
    mentioned: 'No pull requests mentioning you',
  }

  if (!prs?.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <HugeiconsIcon icon={Tick02Icon} size={24} />
        <p className="text-sm">{emptyMessages[filter]}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {prs.length} result{prs.length !== 1 ? 's' : ''}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {prs.map((pr) => (
          <PRCard key={pr.id} pr={pr} />
        ))}
      </div>
    </div>
  )
}

function PRCard({ pr }: { pr: GitHubPR }) {
  return (
    <Card className="transition-colors hover:border-border/80">
      <CardContent className="py-4">
        <a
          href={pr.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block space-y-2"
        >
          <div className="flex items-start gap-2">
            <span className="line-clamp-2 text-sm font-medium">{pr.title}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {pr.repository.fullName}#{pr.number}
            </span>
            {pr.draft && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  'bg-amber-400/20 text-amber-600 dark:text-amber-400'
                )}
              >
                Draft
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pr.author.avatarUrl && (
              <img
                src={pr.author.avatarUrl}
                alt={pr.author.login}
                className="h-4 w-4 rounded-full"
              />
            )}
            <span className="text-xs text-muted-foreground">{pr.author.login}</span>
          </div>
          {pr.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {pr.labels.slice(0, 3).map((label) => (
                <Badge
                  key={label.name}
                  className="text-xs"
                  style={{
                    backgroundColor: `#${label.color}20`,
                    color: `#${label.color}`,
                    borderColor: `#${label.color}40`,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
              {pr.labels.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{pr.labels.length - 3}
                </Badge>
              )}
            </div>
          )}
        </a>
      </CardContent>
    </Card>
  )
}
