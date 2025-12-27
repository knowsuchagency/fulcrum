import { useTranslation } from 'react-i18next'
import { useGitHubIssues, type GitHubIssue, type IssueFilter } from '@/hooks/use-github'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, Alert02Icon, Tick02Icon } from '@hugeicons/core-free-icons'

interface Props {
  filter: IssueFilter
  viboraReposOnly: boolean
  org?: string
}

export function IssuesList({ filter, viboraReposOnly, org }: Props) {
  const { t } = useTranslation('review')
  const { t: tc } = useTranslation('common')
  const { data: issues, isLoading, error } = useGitHubIssues(filter, viboraReposOnly, org)

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
        <p className="text-sm">{t('issues.failedToLoad')}</p>
        <p className="text-xs">{error.message}</p>
      </div>
    )
  }

  const emptyMessageKeys: Record<IssueFilter, string> = {
    assigned: 'issues.empty.assigned',
    created: 'issues.empty.created',
    mentioned: 'issues.empty.mentioned',
  }

  if (!issues?.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <HugeiconsIcon icon={Tick02Icon} size={24} />
        <p className="text-sm">{t(emptyMessageKeys[filter])}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {tc(issues.length === 1 ? 'results.one' : 'results.other', { count: issues.length })}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: GitHubIssue }) {
  return (
    <Card className="transition-colors hover:border-border/80">
      <CardContent className="py-4">
        <a
          href={issue.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block space-y-2"
        >
          <div className="flex items-start gap-2">
            <span className="line-clamp-2 text-sm font-medium">{issue.title}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {issue.repository.fullName}#{issue.number}
            </span>
          </div>
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.labels.slice(0, 3).map((label) => (
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
              {issue.labels.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{issue.labels.length - 3}
                </Badge>
              )}
            </div>
          )}
        </a>
      </CardContent>
    </Card>
  )
}
