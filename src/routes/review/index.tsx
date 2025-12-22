import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
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
  const [activeTab, setActiveTab] = useState<'prs' | 'issues'>('prs')
  const [prFilter, setPrFilter] = useState<PRFilter>('review_requested')
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('assigned')
  const [viboraReposOnly, setViboraReposOnly] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<string>('')
  const { data: user, isLoading: isUserLoading } = useGitHubUser()
  const { data: orgs = [] } = useGitHubOrgs()

  // Show PAT warning if user is not authenticated (and not loading)
  if (!isUserLoading && !user) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-border px-4 py-2">
          <h1 className="text-sm font-medium">Review</h1>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <HugeiconsIcon icon={Key01Icon} size={24} className="text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium">GitHub Token Required</h2>
            <p className="text-sm text-muted-foreground">
              To view your issues and pull requests, add a GitHub Personal Access Token in Settings.
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-left">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Required scopes:</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• <code className="rounded bg-muted px-1">repo</code> (for private repositories)</li>
                <li>• <code className="rounded bg-muted px-1">read:user</code> (for user info)</li>
                <li>• <code className="rounded bg-muted px-1">read:org</code> (for organization list)</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user,read:org&description=Vibora"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <HugeiconsIcon icon={LinkSquare02Icon} size={14} data-slot="icon" />
                  Generate Token
                </Button>
              </a>
              <Link to="/settings">
                <Button size="sm" className="w-full">Go to Settings</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium">Review</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Filter dropdown - different options for PRs vs Issues */}
          {activeTab === 'prs' ? (
            <Select value={prFilter} onValueChange={(v) => setPrFilter(v as PRFilter)}>
              <SelectTrigger size="sm" className="min-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Created by me</SelectItem>
                <SelectItem value="assigned">Assigned to me</SelectItem>
                <SelectItem value="review_requested">Review requests</SelectItem>
                <SelectItem value="mentioned">Mentioned</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={issueFilter} onValueChange={(v) => setIssueFilter(v as IssueFilter)}>
              <SelectTrigger size="sm" className="min-w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned to me</SelectItem>
                <SelectItem value="created">Created by me</SelectItem>
                <SelectItem value="mentioned">Mentioned</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Organization filter */}
          <Select value={selectedOrg} onValueChange={(v) => setSelectedOrg(v || '')}>
            <SelectTrigger size="sm" className="min-w-[140px]">
              <SelectValue>
                {selectedOrg || 'All Orgs'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Organizations</SelectItem>
              {orgs.map((org) => (
                <SelectItem key={org.login} value={org.login}>
                  {org.login}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Repo scope toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch
              checked={viboraReposOnly}
              onCheckedChange={setViboraReposOnly}
              disabled={!!selectedOrg}
            />
            <span className="text-muted-foreground">Vibora repos only</span>
          </label>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'prs' | 'issues')}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border px-4">
          <TabsList variant="line">
            <TabsTrigger value="prs">Pull Requests</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="prs" className="flex-1 overflow-auto p-4">
          <PRsList
            filter={prFilter}
            viboraReposOnly={viboraReposOnly}
            org={selectedOrg || undefined}
          />
        </TabsContent>

        <TabsContent value="issues" className="flex-1 overflow-auto p-4">
          <IssuesList
            filter={issueFilter}
            viboraReposOnly={viboraReposOnly}
            org={selectedOrg || undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
