import { useState, useMemo } from 'react'
import { useRepositories } from '@/hooks/use-repositories'
import { useProjects, useAddRepositoryToProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  Search01Icon,
  Folder01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

interface LinkRepositoriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
}

interface RepoWithProject {
  id: string
  displayName: string
  path: string
  projectId: string | null
  projectName: string | null
}

export function LinkRepositoriesModal({
  open,
  onOpenChange,
  projectId,
  projectName,
}: LinkRepositoriesModalProps) {
  const { data: repositories } = useRepositories()
  const { data: projects } = useProjects()
  const addRepositoryMutation = useAddRepositoryToProject()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)

  // Build a map of repo ID to project info
  const reposWithProjects: RepoWithProject[] = useMemo(() => {
    if (!repositories) return []

    const repoToProject = new Map<string, { projectId: string; projectName: string }>()
    if (projects) {
      for (const project of projects) {
        for (const repo of project.repositories) {
          repoToProject.set(repo.id, { projectId: project.id, projectName: project.name })
        }
      }
    }

    return repositories.map((repo) => {
      const projectInfo = repoToProject.get(repo.id)
      return {
        id: repo.id,
        displayName: repo.displayName,
        path: repo.path,
        projectId: projectInfo?.projectId ?? null,
        projectName: projectInfo?.projectName ?? null,
      }
    })
  }, [repositories, projects])

  // Filter repos based on search query
  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return reposWithProjects
    const query = searchQuery.toLowerCase()
    return reposWithProjects.filter(
      (repo) =>
        repo.displayName.toLowerCase().includes(query) ||
        repo.path.toLowerCase().includes(query)
    )
  }, [reposWithProjects, searchQuery])

  // Stats for the selected repos
  const selectedRepos = filteredRepos.filter((repo) => selectedRepoIds.has(repo.id))
  const reposToMove = selectedRepos.filter(
    (repo) => repo.projectId && repo.projectId !== projectId
  )

  // Toggle selection
  const toggleSelection = (repoId: string) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }

  // Select all addable repos
  const selectAllAddable = () => {
    const addable = filteredRepos.filter((repo) => repo.projectId !== projectId)
    setSelectedRepoIds(new Set(addable.map((r) => r.id)))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedRepoIds(new Set())
  }

  // Handle add
  const handleAdd = async () => {
    if (selectedRepoIds.size === 0) return

    setIsAdding(true)
    let added = 0
    let failed = 0

    for (const repoId of selectedRepoIds) {
      const repo = reposWithProjects.find((r) => r.id === repoId)
      if (!repo) continue

      // Skip repos already in this project
      if (repo.projectId === projectId) continue

      try {
        await addRepositoryMutation.mutateAsync({
          projectId,
          repositoryId: repoId,
          moveFromProject: repo.projectId !== null, // Move if it's in another project
        })
        added++
      } catch {
        failed++
      }
    }

    setIsAdding(false)

    if (failed > 0) {
      toast.error(`Linked ${added} repositories, ${failed} failed`)
    } else {
      toast.success(`Linked ${added} ${added === 1 ? 'repository' : 'repositories'}`)
      onOpenChange(false)
    }
  }

  // Reset when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSearchQuery('')
      setSelectedRepoIds(new Set())
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Link Repositories to "{projectName}"</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 space-y-4">
          {/* Search */}
          <div className="relative shrink-0">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="pl-9"
            />
          </div>

          {/* Repository list */}
          <div className="flex-1 overflow-y-auto min-h-0 rounded-md border">
            {filteredRepos.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {repositories?.length === 0
                  ? 'No repositories found in Fulcrum'
                  : 'No repositories match your search'}
              </div>
            ) : (
              filteredRepos.map((repo) => {
                const isInThisProject = repo.projectId === projectId
                const isInOtherProject = repo.projectId && repo.projectId !== projectId
                const isSelected = selectedRepoIds.has(repo.id)

                return (
                  <div
                    key={repo.id}
                    className={`flex items-start gap-3 px-3 py-3 border-b last:border-b-0 transition-colors ${
                      isInThisProject ? 'bg-muted/30 opacity-60' : 'hover:bg-muted/50 cursor-pointer'
                    }`}
                    onClick={() => !isInThisProject && toggleSelection(repo.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isInThisProject}
                      className="mt-0.5 pointer-events-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{repo.displayName}</span>
                        {isSelected && isInOtherProject && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">
                            Will move
                          </Badge>
                        )}
                        {isInThisProject && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Already here
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
                        <span className="truncate font-mono">{repo.path}</span>
                      </div>
                      {isInOtherProject && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Currently in: {repo.projectName}
                        </div>
                      )}
                      {!repo.projectId && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Not in any project
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Warning for repos being moved */}
          {reposToMove.length > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 shrink-0">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={14}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
              />
              <span>
                {reposToMove.length} {reposToMove.length === 1 ? 'repository' : 'repositories'} will be moved from{' '}
                {reposToMove.length === 1 ? 'another project' : 'other projects'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between shrink-0 pt-2">
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={selectAllAddable}
              >
                Select all
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={clearSelection}
              >
                Clear
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAdding}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={selectedRepoIds.size === 0 || isAdding}>
                {isAdding ? (
                  <>
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    Linking...
                  </>
                ) : (
                  `Link ${selectedRepoIds.size} ${selectedRepoIds.size === 1 ? 'Repository' : 'Repositories'}`
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
