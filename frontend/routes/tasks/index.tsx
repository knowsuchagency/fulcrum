import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { TaskDependencyGraph } from '@/components/graph/task-dependency-graph'
import { TaskCalendar } from '@/components/calendar/task-calendar'
import { HugeiconsIcon } from '@hugeicons/react'
import { FilterIcon, Search01Icon, GridViewIcon, HierarchyIcon, Calendar03Icon } from '@hugeicons/core-free-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTasks } from '@/hooks/use-tasks'
import { useProjects } from '@/hooks/use-projects'

type ViewMode = 'kanban' | 'graph' | 'calendar'

interface TasksSearch {
  project?: string // 'inbox' for tasks without project, or project ID
  view?: ViewMode
}

export const Route = createFileRoute('/tasks/')({
  component: TasksView,
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    view: search.view === 'graph' ? 'graph' : search.view === 'calendar' ? 'calendar' : undefined,
  }),
})

function TasksView() {
  const { t } = useTranslation('tasks')
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { project: projectFilter, view: viewMode = 'kanban' } = Route.useSearch()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const setProjectFilter = useCallback(
    (projectId: string | null) => {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, project: projectId || undefined }),
        replace: true,
      })
    },
    [navigate]
  )

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, view: mode === 'kanban' ? undefined : mode }),
        replace: true,
      })
    },
    [navigate]
  )

  // Count of tasks without a project (inbox)
  // A task is in inbox if it has no projectId AND no repositoryId/repoPath that belongs to a project
  const inboxCount = useMemo(() => {
    // Get all repository IDs and paths that belong to projects
    const projectRepoIds = new Set<string>()
    const projectRepoPaths = new Set<string>()
    for (const project of projects) {
      for (const repo of project.repositories) {
        projectRepoIds.add(repo.id)
        projectRepoPaths.add(repo.path)
      }
    }
    // Count tasks not associated with any project directly or via repository
    return tasks.filter(
      (t) =>
        !t.projectId &&
        (!t.repositoryId || !projectRepoIds.has(t.repositoryId)) &&
        (!t.repoPath || !projectRepoPaths.has(t.repoPath))
    ).length
  }, [tasks, projects])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        {viewMode === 'kanban' && (
          <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
            <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-6"
            />
          </div>
        )}
        {viewMode === 'kanban' && (
          <Select
            value={projectFilter ?? ''}
            onValueChange={(v) => setProjectFilter(v || null)}
          >
            <SelectTrigger size="sm" className="shrink-0 gap-1.5">
              <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
              <SelectValue>
                {projectFilter === 'inbox'
                  ? `Inbox (${inboxCount})`
                  : projectFilter
                    ? projects.find((p) => p.id === projectFilter)?.name ?? projectFilter
                    : t('allProjects')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[200px]">
              <SelectItem value="">{t('allProjects')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name} ({project.taskCount})
                </SelectItem>
              ))}
              <SelectItem value="inbox">Inbox ({inboxCount})</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <ToggleGroup
          value={[viewMode]}
          onValueChange={(v) => {
            const selected = Array.isArray(v) ? v[0] : v
            if (selected) setViewMode(selected as ViewMode)
          }}
          size="sm"
          variant="outline"
        >
          <ToggleGroupItem value="kanban" aria-label="Kanban view">
            <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} />
          </ToggleGroupItem>
          <ToggleGroupItem value="calendar" aria-label="Calendar view">
            <HugeiconsIcon icon={Calendar03Icon} size={14} strokeWidth={2} />
          </ToggleGroupItem>
          <ToggleGroupItem value="graph" aria-label="Dependency graph">
            <HugeiconsIcon icon={HierarchyIcon} size={14} strokeWidth={2} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' && (
          <KanbanBoard projectFilter={projectFilter ?? null} searchQuery={searchQuery} />
        )}
        {viewMode === 'calendar' && <TaskCalendar />}
        {viewMode === 'graph' && <TaskDependencyGraph />}
      </div>
    </div>
  )
}
