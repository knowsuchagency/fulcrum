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
import { IssuesList } from '@/components/review/issues-list'
import { PRsList } from '@/components/review/prs-list'
import { useGitHubUser, type PRFilter } from '@/hooks/use-github'

export const Route = createFileRoute('/review/')({
  component: ReviewPage,
})

function ReviewPage() {
  const [activeTab, setActiveTab] = useState<'prs' | 'issues'>('prs')
  const [prFilter, setPrFilter] = useState<PRFilter>('all')
  const [viboraReposOnly, setViboraReposOnly] = useState(false)
  const { data: user } = useGitHubUser()

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium">Review</h1>
          {!user && (
            <Link to="/settings" className="text-xs text-muted-foreground hover:underline">
              Configure GitHub PAT in Settings
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Repo scope toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch checked={viboraReposOnly} onCheckedChange={setViboraReposOnly} />
            <span className="text-muted-foreground">Vibora repos only</span>
          </label>

          {/* PR filter (only shown on PRs tab) */}
          {activeTab === 'prs' && (
            <Select value={prFilter} onValueChange={(v) => setPrFilter(v as PRFilter)}>
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All PRs</SelectItem>
                <SelectItem value="created">Created by me</SelectItem>
                <SelectItem value="assigned">Assigned to me</SelectItem>
              </SelectContent>
            </Select>
          )}
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
          <PRsList filter={prFilter} viboraReposOnly={viboraReposOnly} />
        </TabsContent>

        <TabsContent value="issues" className="flex-1 overflow-auto p-4">
          <IssuesList viboraReposOnly={viboraReposOnly} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
