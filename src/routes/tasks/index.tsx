import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { HugeiconsIcon } from '@hugeicons/react'
import { FilterIcon, Search01Icon } from '@hugeicons/core-free-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useTasks } from '@/hooks/use-tasks'

interface TasksSearch {
  repo?: string
}

export const Route = createFileRoute('/tasks/')({
  component: KanbanView,
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    repo: typeof search.repo === 'string' ? search.repo : undefined,
  }),
})

function KanbanView() {
  const { t } = useTranslation('tasks')
  const { data: tasks = [] } = useTasks()
  const { repo: repoFilter } = Route.useSearch()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const setRepoFilter = useCallback(
    (repo: string | null) => {
      navigate({
        to: '/tasks',
        search: repo ? { repo } : {},
        replace: true,
      })
    },
    [navigate]
  )

  // Unique repo names for filtering
  const repoNames = useMemo(() => {
    const names = new Set(tasks.map((t) => t.repoName))
    return Array.from(names).sort()
  }, [tasks])

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex shrink-0 items-center border-b border-border bg-background px-4 py-2">
        <h1 className="text-sm font-medium max-sm:hidden">{t('title')}</h1>
        <div className="absolute left-1/2 -translate-x-1/2">
          <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-64 pl-6"
          />
        </div>
        <div className="ml-auto">
          <Select
            value={repoFilter ?? ''}
            onValueChange={(v) => setRepoFilter(v || null)}
          >
            <SelectTrigger size="sm" className="max-sm:w-auto gap-1.5">
              <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
              <SelectValue>
                {repoFilter ?? t('allRepos')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[160px]">
              <SelectItem value="">{t('allRepos')}</SelectItem>
              {repoNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard repoFilter={repoFilter ?? null} searchQuery={searchQuery} />
      </div>
    </div>
  )
}
