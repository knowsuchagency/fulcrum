import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CpuIcon,
  Calendar02Icon,
  GitBranchIcon,
  ClaudeIcon,
  Chart02Icon,
  BrowserIcon,
  GridIcon,
} from '@hugeicons/core-free-icons'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  SystemTab,
  ProcessesTab,
  ClaudeTab,
  ViboraTab,
  WorktreesTab,
  UsageTab,
  JobsTab,
} from '@/components/monitoring/tabs'
import { useJobsAvailable } from '@/hooks/use-jobs'
import { useDeveloperMode } from '@/hooks/use-config'

type MonitoringTab = 'system' | 'processes' | 'claude' | 'vibora' | 'worktrees' | 'usage' | 'jobs'

const VALID_TABS: MonitoringTab[] = ['system', 'processes', 'claude', 'vibora', 'worktrees', 'usage', 'jobs']

type JobScope = 'all' | 'user' | 'system'

export const Route = createFileRoute('/monitoring/')({
  component: MonitoringPage,
  validateSearch: (search: Record<string, unknown>): { tab?: MonitoringTab; scope?: JobScope } => ({
    tab: VALID_TABS.includes(search.tab as MonitoringTab) ? (search.tab as MonitoringTab) : undefined,
    scope: ['all', 'user', 'system'].includes(search.scope as string) ? (search.scope as JobScope) : undefined,
  }),
})

function MonitoringPage() {
  const { t } = useTranslation('monitoring')
  const { tab: urlTab, scope: urlScope } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: developerMode } = useDeveloperMode()
  const { data: jobsAvailable } = useJobsAvailable()

  const activeTab = urlTab || 'system'
  const [jobScopeFilter, setJobScopeFilter] = useState<JobScope>(urlScope || 'user')

  const handleTabChange = (newTab: string) => {
    const validTab = newTab as MonitoringTab
    navigate({
      search: (prev) => ({ ...prev, tab: validTab === 'system' ? undefined : validTab }),
      replace: true,
    })
  }

  const handleJobScopeChange = (scope: JobScope) => {
    setJobScopeFilter(scope)
    navigate({
      search: (prev) => ({ ...prev, scope: scope === 'user' ? undefined : scope }),
      replace: true,
    })
  }

  // Show Jobs tab only if enabled and systemd is available
  const showJobsTab = developerMode?.enabled && jobsAvailable

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <h1 className="text-sm font-medium">{t('title')}</h1>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
          <TabsList className="shrink-0 justify-start gap-1 border-b border-border bg-transparent rounded-none px-4 h-10">
            <TabsTrigger value="system" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={CpuIcon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.system')}</span>
            </TabsTrigger>
            <TabsTrigger value="processes" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={GridIcon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.processes')}</span>
            </TabsTrigger>
            <TabsTrigger value="claude" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={ClaudeIcon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.claude')}</span>
            </TabsTrigger>
            <TabsTrigger value="vibora" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={BrowserIcon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.vibora')}</span>
            </TabsTrigger>
            <TabsTrigger value="worktrees" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.worktrees')}</span>
            </TabsTrigger>
            {showJobsTab && (
              <TabsTrigger value="jobs" className="gap-1.5 data-[state=active]:bg-muted">
                <HugeiconsIcon icon={Calendar02Icon} size={14} strokeWidth={2} />
                <span className="max-sm:hidden">{t('tabs.jobs')}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="usage" className="gap-1.5 data-[state=active]:bg-muted">
              <HugeiconsIcon icon={Chart02Icon} size={14} strokeWidth={2} />
              <span className="max-sm:hidden">{t('tabs.usage')}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto p-4">
            <TabsContent value="system" className="m-0">
              <SystemTab />
            </TabsContent>

            <TabsContent value="processes" className="m-0">
              <ProcessesTab />
            </TabsContent>

            <TabsContent value="claude" className="m-0">
              <ClaudeTab />
            </TabsContent>

            <TabsContent value="vibora" className="m-0">
              <ViboraTab />
            </TabsContent>

            <TabsContent value="worktrees" className="m-0">
              <WorktreesTab />
            </TabsContent>

            {showJobsTab && (
              <TabsContent value="jobs" className="m-0">
                <JobsTab scopeFilter={jobScopeFilter} onScopeChange={handleJobScopeChange} />
              </TabsContent>
            )}

            <TabsContent value="usage" className="m-0">
              <UsageTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
