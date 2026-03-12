import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { TaskDependencyGraph } from '@/components/graph/task-dependency-graph'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, GridViewIcon, HierarchyIcon, LayersIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { TagsFilter } from '@/components/tasks/tags-filter'
import { ProjectFilter } from '@/components/tasks/project-filter'
import { TaskTypeFilter } from '@/components/tasks/task-type-filter'
import { PriorityFilter } from '@/components/tasks/priority-filter'
import type { TaskType, TaskPriority } from '../../../shared/types'

type ViewMode = 'kanban' | 'graph'

interface TasksSearch {
  project?: string // 'inbox' for tasks without project, or project ID
  tags?: string // comma-separated tag names
  types?: string // comma-separated task types (worktree, scratch, manual)
  priorities?: string // comma-separated priorities (high, medium, low)
  view?: ViewMode
  task?: string // task ID for manual task modal
}

export const Route = createFileRoute('/tasks/')({
  component: TasksView,
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
    tags: typeof search.tags === 'string' ? search.tags : undefined,
    types: typeof search.types === 'string' ? search.types : undefined,
    priorities: typeof search.priorities === 'string' ? search.priorities : undefined,
    view: search.view === 'graph' ? 'graph' : undefined,
    task: typeof search.task === 'string' ? search.task : undefined,
  }),
})

function TasksView() {
  const { t } = useTranslation('tasks')
  const { project: projectFilter, tags: tagsParam, types: typesParam, priorities: prioritiesParam, view: viewMode = 'kanban', task: selectedTaskId } = Route.useSearch()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [showTypeLabels, setShowTypeLabels] = useState(false)

  // Parse tags from URL param (comma-separated)
  const tagsFilter = useMemo(() => {
    if (!tagsParam) return []
    return tagsParam.split(',').filter(Boolean)
  }, [tagsParam])

  // Parse task types from URL param (comma-separated)
  const taskTypesFilter = useMemo(() => {
    if (!typesParam) return [] as TaskType[]
    return typesParam.split(',').filter(Boolean) as TaskType[]
  }, [typesParam])

  // Parse priorities from URL param (comma-separated)
  const prioritiesFilter = useMemo(() => {
    if (!prioritiesParam) return [] as TaskPriority[]
    return prioritiesParam.split(',').filter(Boolean) as TaskPriority[]
  }, [prioritiesParam])

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

  const setTaskTypesFilter = useCallback(
    (types: TaskType[]) => {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, types: types.length > 0 ? types.join(',') : undefined }),
        replace: true,
      })
    },
    [navigate]
  )

  const setPrioritiesFilter = useCallback(
    (priorities: TaskPriority[]) => {
      navigate({
        to: '/tasks',
        search: (prev) => ({ ...prev, priorities: priorities.length > 0 ? priorities.join(',') : undefined }),
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
      <div className="film-grain relative flex shrink-0 items-center gap-2 border-b border-border px-4 py-2" style={{ background: 'var(--gradient-header)' }}>
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
        {/* Filters hidden on mobile - use AI assistant instead */}
        <div className="hidden sm:contents">
          <ProjectFilter value={projectFilter ?? null} onChange={setProjectFilter} />
          <TagsFilter value={tagsFilter} onChange={setTagsFilter} />
          <TaskTypeFilter value={taskTypesFilter} onChange={setTaskTypesFilter} />
          <PriorityFilter value={prioritiesFilter} onChange={setPrioritiesFilter} />
          <Tooltip>
            <TooltipTrigger>
              <Toggle
                size="sm"
                variant="outline"
                pressed={showTypeLabels}
                onPressedChange={setShowTypeLabels}
                className="h-7 w-7 p-0 shrink-0"
                aria-label={t('typeFilter.showLabels')}
              >
                <HugeiconsIcon icon={LayersIcon} size={14} strokeWidth={2} />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{t('typeFilter.showLabels')}</TooltipContent>
          </Tooltip>
        </div>
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
          <ToggleGroupItem value="graph" aria-label="Dependency graph">
            <HugeiconsIcon icon={HierarchyIcon} size={14} strokeWidth={2} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' && (
          <KanbanBoard projectFilter={projectFilter ?? null} searchQuery={searchQuery} tagsFilter={tagsFilter} taskTypesFilter={taskTypesFilter} prioritiesFilter={prioritiesFilter} showTypeLabels={showTypeLabels} selectedTaskId={selectedTaskId} />
        )}
        {viewMode === 'graph' && <TaskDependencyGraph projectFilter={projectFilter ?? null} tagsFilter={tagsFilter} taskTypesFilter={taskTypesFilter} prioritiesFilter={prioritiesFilter} />}
      </div>
    </div>
  )
}
