import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { IssuesList } from '@/components/review/issues-list'
import { PRsList } from '@/components/review/prs-list'
import { HugeiconsIcon } from '@hugeicons/react'
import { Key01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import {
  useGitHubUser,
  useGitHubOrgs,
  type PRFilter,
  type IssueFilter,
} from '@/hooks/use-github'

export const Route = createFileRoute('/review/')({
  component: ReviewPage,
})

function ReviewPage() {
  const { t } = useTranslation('review')
  const [activeTab, setActiveTab] = useState<'prs' | 'issues'>('prs')
  const [prFilter, setPrFilter] = useState<PRFilter>('review_requested')
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('assigned')
  const [fulcrumReposOnly, setFulcrumReposOnly] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<string>('')
  const { data: user, isLoading: isUserLoading } = useGitHubUser()
  const { data: orgs = [] } = useGitHubOrgs()

  // Show PAT warning if user is not authenticated (and not loading)
  if (!isUserLoading && !user) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-border bg-background px-4 py-2" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <HugeiconsIcon icon={Key01Icon} size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium">{t('github.tokenRequired')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('github.tokenDescription')}
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-left">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('github.requiredScopes')}</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• <code className="rounded bg-muted px-1">repo</code> {t('github.scopes.repo')}</li>
                <li>• <code className="rounded bg-muted px-1">read:user</code> {t('github.scopes.readUser')}</li>
                <li>• <code className="rounded bg-muted px-1">read:org</code> {t('github.scopes.readOrg')}</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user,read:org&description=Fulcrum"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <HugeiconsIcon icon={LinkSquare02Icon} size={14} data-slot="icon" />
                  {t('github.generateToken')}
                </Button>
              </a>
              <Link to="/settings">
                <Button size="sm" className="w-full">{t('github.goToSettings')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'prs' | 'issues')}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex shrink-0 flex-col border-b border-border bg-background sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between px-4 py-1 max-sm:px-2">
            <TabsList variant="line">
              <TabsTrigger value="prs">{t('tabs.pullRequests')}</TabsTrigger>
              <TabsTrigger value="issues">{t('tabs.issues')}</TabsTrigger>
            </TabsList>

            {/* Fulcrum repos toggle - shown inline with tabs on mobile */}
            <label className="flex cursor-pointer items-center gap-2 text-xs sm:hidden" title={t('filters.fulcrumReposOnly')}>
              <Switch
                checked={fulcrumReposOnly}
                onCheckedChange={setFulcrumReposOnly}
                disabled={!!selectedOrg}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 border-t border-border px-4 py-1.5 sm:gap-4 sm:border-t-0 sm:px-4 sm:py-1">
            {/* Filter dropdown - different options for PRs vs Issues */}
            {activeTab === 'prs' ? (
              <Select value={prFilter} onValueChange={(v) => setPrFilter(v as PRFilter)}>
                <SelectTrigger size="sm" className="flex-1 sm:flex-initial">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">{t('filters.pr.created')}</SelectItem>
                  <SelectItem value="assigned">{t('filters.pr.assigned')}</SelectItem>
                  <SelectItem value="review_requested">{t('filters.pr.reviewRequested')}</SelectItem>
                  <SelectItem value="mentioned">{t('filters.pr.mentioned')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={issueFilter} onValueChange={(v) => setIssueFilter(v as IssueFilter)}>
                <SelectTrigger size="sm" className="flex-1 sm:flex-initial">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">{t('filters.issue.assigned')}</SelectItem>
                  <SelectItem value="created">{t('filters.issue.created')}</SelectItem>
                  <SelectItem value="mentioned">{t('filters.issue.mentioned')}</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Organization filter */}
            <Select value={selectedOrg} onValueChange={(v) => setSelectedOrg(v || '')}>
              <SelectTrigger size="sm" className="flex-1 sm:flex-initial">
                <SelectValue>
                  {selectedOrg || t('filters.allOrgs')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('filters.allOrganizations')}</SelectItem>
                {orgs.map((org) => (
                  <SelectItem key={org.login} value={org.login}>
                    {org.login}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Repo scope toggle - hidden on mobile, shown on desktop */}
            <label className="hidden cursor-pointer items-center gap-2 text-xs sm:flex" title={t('filters.fulcrumReposOnly')}>
              <Switch
                checked={fulcrumReposOnly}
                onCheckedChange={setFulcrumReposOnly}
                disabled={!!selectedOrg}
              />
              <span className="text-muted-foreground">{t('filters.fulcrumReposOnly')}</span>
            </label>
          </div>
        </div>

        <TabsContent value="prs" className="flex-1 overflow-auto p-4">
          <PRsList
            filter={prFilter}
            fulcrumReposOnly={fulcrumReposOnly}
            org={selectedOrg || undefined}
          />
        </TabsContent>

        <TabsContent value="issues" className="flex-1 overflow-auto p-4">
          <IssuesList
            filter={issueFilter}
            fulcrumReposOnly={fulcrumReposOnly}
            org={selectedOrg || undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
