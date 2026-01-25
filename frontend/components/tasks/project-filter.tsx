import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, FilterIcon, ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useProjects } from '@/hooks/use-projects'
import { useTasks } from '@/hooks/use-tasks'
import { cn } from '@/lib/utils'

export interface ProjectOption {
  id: string
  name: string
  count?: number
}

interface ProjectFilterProps {
  value: string | null
  onChange: (projectId: string | null) => void
  /** Custom options to display instead of auto-fetched projects. When provided, inbox option is hidden. */
  options?: ProjectOption[]
  /** Custom label for the "all" option */
  allLabel?: string
  /** Whether to show inbox option (only when options is not provided) */
  showInbox?: boolean
}

export function ProjectFilter({ value, onChange, options, allLabel, showInbox = true }: ProjectFilterProps) {
  const { t } = useTranslation('tasks')
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Only fetch data when no custom options provided
  const { data: fetchedProjects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()

  // Use custom options or fetched projects
  const projects = options ?? fetchedProjects.map(p => ({ id: p.id, name: p.name, count: p.taskCount }))
  const useCustomOptions = !!options

  // Count of tasks without a project (inbox) - only calculated when not using custom options
  const inboxCount = useMemo(() => {
    if (useCustomOptions) return 0
    const projectRepoIds = new Set<string>()
    const projectRepoPaths = new Set<string>()
    for (const project of fetchedProjects) {
      for (const repo of project.repositories) {
        projectRepoIds.add(repo.id)
        projectRepoPaths.add(repo.path)
      }
    }
    return tasks.filter(
      (t) =>
        !t.projectId &&
        (!t.repositoryId || !projectRepoIds.has(t.repositoryId)) &&
        (!t.repoPath || !projectRepoPaths.has(t.repoPath))
    ).length
  }, [tasks, fetchedProjects, useCustomOptions])

  // Filter projects by search query
  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const selectProject = (projectId: string | null) => {
    onChange(projectId)
    setOpen(false)
  }

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  const selectedProject = value ? projects.find((p) => p.id === value) : null
  const displayName = value === 'inbox'
    ? 'Inbox'
    : selectedProject?.name ?? null

  const allProjectsLabel = allLabel ?? t('allProjects')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'shrink-0 gap-1.5 h-7 px-2',
              value && 'pr-1'
            )}
          />
        }
      >
        <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
        {!value ? (
          <>
            <span className="text-xs">{allProjectsLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
          </>
        ) : (
          <>
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] gap-0.5"
            >
              {displayName}
              {value === 'inbox' ? ` (${inboxCount})` : selectedProject?.count !== undefined ? ` (${selectedProject.count})` : ''}
            </Badge>
            <button
              onClick={clearSelection}
              className="ml-0.5 p-0.5 hover:text-destructive transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchProjects')}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-48 overflow-y-auto py-1">
          {/* All Projects option */}
          <button
            className={cn(
              'w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2',
              !value && 'bg-accent'
            )}
            onClick={() => selectProject(null)}
          >
            <span className="w-3.5 shrink-0">
              {!value && (
                <HugeiconsIcon icon={Tick02Icon} size={14} className="text-primary" />
              )}
            </span>
            <span className="flex-1 truncate">{allProjectsLabel}</span>
          </button>

          {/* Project list */}
          {filteredProjects.map((project) => {
            const isSelected = value === project.id
            return (
              <button
                key={project.id}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2',
                  isSelected && 'bg-accent'
                )}
                onClick={() => selectProject(project.id)}
              >
                <span className="w-3.5 shrink-0">
                  {isSelected && (
                    <HugeiconsIcon icon={Tick02Icon} size={14} className="text-primary" />
                  )}
                </span>
                <span className="flex-1 truncate">{project.name}</span>
                {project.count !== undefined && (
                  <span className="text-muted-foreground text-[10px]">
                    {project.count}
                  </span>
                )}
              </button>
            )
          })}

          {/* Inbox option - only show when not using custom options and showInbox is true */}
          {!useCustomOptions && showInbox && 'inbox'.includes(searchQuery.toLowerCase()) && (
            <button
              className={cn(
                'w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2',
                value === 'inbox' && 'bg-accent'
              )}
              onClick={() => selectProject('inbox')}
            >
              <span className="w-3.5 shrink-0">
                {value === 'inbox' && (
                  <HugeiconsIcon icon={Tick02Icon} size={14} className="text-primary" />
                )}
              </span>
              <span className="flex-1 truncate">Inbox</span>
              <span className="text-muted-foreground text-[10px]">
                {inboxCount}
              </span>
            </button>
          )}

          {filteredProjects.length === 0 && (useCustomOptions || !('inbox'.includes(searchQuery.toLowerCase()))) && (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
              {t('noProjectsFound')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
