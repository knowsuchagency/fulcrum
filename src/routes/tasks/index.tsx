import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { SelectionProvider, useSelection } from '@/components/kanban/selection-context'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Cancel01Icon, CheckListIcon, FilterIcon } from '@hugeicons/core-free-icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBulkDeleteTasks, useTasks } from '@/hooks/use-tasks'

export const Route = createFileRoute('/tasks/')({
  component: KanbanView,
})

function KanbanView() {
  return (
    <SelectionProvider>
      <KanbanViewContent />
    </SelectionProvider>
  )
}

function KanbanViewContent() {
  const { selectMode, setSelectMode, selectedIds, selectedCount, exitSelectMode } = useSelection()
  const bulkDelete = useBulkDeleteTasks()
  const { data: tasks = [] } = useTasks()
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  // Unique repo names for filtering
  const repoNames = useMemo(() => {
    const names = new Set(tasks.map((t) => t.repoName))
    return Array.from(names).sort()
  }, [tasks])

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    bulkDelete.mutate(ids, {
      onSuccess: () => {
        exitSelectMode()
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedCount > 0 ? `${selectedCount} selected` : 'Select tasks'}
              </span>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} data-slot="icon" />
                Cancel
              </Button>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="destructive" size="sm" disabled={bulkDelete.isPending || selectedCount === 0} />}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
                {bulkDelete.isPending ? 'Deleting...' : `Delete${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedCount} Tasks</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected tasks and remove their worktrees.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    variant="destructive"
                    disabled={bulkDelete.isPending}
                  >
                    {bulkDelete.isPending ? 'Deleting...' : 'Delete All'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <h1 className="text-sm font-medium">Tasks</h1>
            <div className="flex items-center gap-2">
              <Select
                value={repoFilter ?? ''}
                onValueChange={(v) => setRepoFilter(v || null)}
              >
                <SelectTrigger size="sm" className="min-w-[120px]">
                  <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                  <SelectValue>
                    {repoFilter || 'All Repos'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-[200px]">
                  <SelectItem value="">All Repos</SelectItem>
                  {repoNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                <HugeiconsIcon icon={CheckListIcon} size={14} strokeWidth={2} data-slot="icon" />
                Select
              </Button>
            </div>
          </>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard repoFilter={repoFilter} />
      </div>
    </div>
  )
}
