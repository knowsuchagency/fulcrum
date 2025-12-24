import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
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

export const Route = createFileRoute('/tasks/')({
  component: KanbanView,
})

function KanbanView() {
  const { data: tasks = [] } = useTasks()
  const [repoFilter, setRepoFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Unique repo names for filtering
  const repoNames = useMemo(() => {
    const names = new Set(tasks.map((t) => t.repoName))
    return Array.from(names).sort()
  }, [tasks])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-sm font-medium max-sm:hidden">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tasks..."
              className="w-40 pl-6"
            />
          </div>
          <Select
            value={repoFilter ?? ''}
            onValueChange={(v) => setRepoFilter(v || null)}
          >
            <SelectTrigger size="sm" className="max-sm:w-auto gap-1.5">
              <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
              <SelectValue>
                {repoFilter || 'All Repos'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[160px]">
              <SelectItem value="">All Repos</SelectItem>
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
        <KanbanBoard repoFilter={repoFilter} searchQuery={searchQuery} />
      </div>
    </div>
  )
}
