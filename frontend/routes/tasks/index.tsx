import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { TaskDependencyGraph } from '@/components/graph/task-dependency-graph'
import { TaskCalendar } from '@/components/calendar/task-calendar'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, GridViewIcon, HierarchyIcon, Calendar03Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TagsFilter } from '@/components/tasks/tags-filter'
import { ProjectFilter } from '@/components/tasks/project-filter'

type ViewMode = 'kanban' | 'graph' | 'calendar'

interface TasksSearch {
  project?: string // 'inbox' for tasks without project, or project ID
  tags?: string // comma-separated tag names
  view?: ViewMode
}

export const Route = createFileRoute('/tasks/')({
  component: TasksView,
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    tags: typeof search.tags === 'string' ? search.tags : undefined,
    view: search.view === 'graph' ? 'graph' : search.view === 'calendar' ? 'calendar' : undefined,
  }),
})

function TasksView() {
  const { t } = useTranslation('tasks')
  const { project: projectFilter, tags: tagsParam, view: viewMode = 'kanban' } = Route.useSearch()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  // Parse tags from URL param (comma-separated)
  const tagsFilter = useMemo(() => {
    if (!tagsParam) return []
    return tagsParam.split(',').filter(Boolean)
  }, [tagsParam])

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

  const setTagsFilter = useCallback(
    (tags: string[]) => {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, tags: tags.length > 0 ? tags.join(',') : undefined }),
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        {viewMode === 'kanban' && (
          <div className="relative shrink-0">
            <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-7 w-48 pl-7 text-xs"
            />
          </div>
        )}
        <ProjectFilter value={projectFilter ?? null} onChange={setProjectFilter} />
        <TagsFilter value={tagsFilter} onChange={setTagsFilter} />
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
          <KanbanBoard projectFilter={projectFilter ?? null} searchQuery={searchQuery} tagsFilter={tagsFilter} />
        )}
        {viewMode === 'calendar' && <TaskCalendar projectFilter={projectFilter ?? null} tagsFilter={tagsFilter} />}
        {viewMode === 'graph' && <TaskDependencyGraph projectFilter={projectFilter ?? null} tagsFilter={tagsFilter} />}
      </div>
    </div>
  )
}
