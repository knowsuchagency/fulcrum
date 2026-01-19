import { useState, useMemo } from 'react'
import { useProjects, useAddRepositoryToProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Search01Icon,
  Folder01Icon,
  Add01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { CreateProjectModalSimple } from './create-project-modal-simple'

interface RepositoryInfo {
  id: string
  displayName: string
  path: string
  currentProjectId?: string | null
  currentProjectName?: string | null
}

interface MoveRepositoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repositories: RepositoryInfo[]
  /** Project ID to exclude from the list (the current project) */
  excludeProjectId?: string
  onSuccess?: () => void
}

export function MoveRepositoryDialog({
  open,
  onOpenChange,
  repositories,
  excludeProjectId,
  onSuccess,
}: MoveRepositoryDialogProps) {
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const addRepositoryMutation = useAddRepositoryToProject()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMoving, setIsMoving] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

  // Filter projects - exclude the current project and filter by search
  const filteredProjects = useMemo(() => {
    let filtered = projects.filter((p) => p.id !== excludeProjectId)

    if (searchQuery.trim()) {
      filtered = filtered
        .map((p) => ({
          project: p,
          score: Math.max(
            fuzzyScore(p.name, searchQuery),
            fuzzyScore(p.description || '', searchQuery)
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ project }) => project)
    }

    return filtered
  }, [projects, excludeProjectId, searchQuery])

  const isSingleRepo = repositories.length === 1
  const dialogTitle = isSingleRepo
    ? 'Move Repository'
    : `Move ${repositories.length} Repositories`
  const dialogDescription = isSingleRepo
    ? `Move "${repositories[0]?.displayName}" to another project`
    : `Move ${repositories.length} repositories to another project`

  const handleMove = async () => {
    if (!selectedProjectId || repositories.length === 0) return

    setIsMoving(true)
    try {
      // Move all repositories to the selected project
      for (const repo of repositories) {
        await addRepositoryMutation.mutateAsync({
          projectId: selectedProjectId,
          repositoryId: repo.id,
          moveFromProject: true,
        })
      }

      const targetProject = projects.find((p) => p.id === selectedProjectId)
      toast.success(
        isSingleRepo
          ? `Moved "${repositories[0]?.displayName}" to ${targetProject?.name}`
          : `Moved ${repositories.length} repositories to ${targetProject?.name}`
      )
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error('Failed to move repositories', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsMoving(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setSelectedProjectId(null)
      setSearchQuery('')
    }
    onOpenChange(newOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          {/* Show repos being moved if multiple */}
          {!isSingleRepo && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Repositories to move:
              </Label>
              <div className="max-h-24 overflow-y-auto rounded border p-2 text-sm space-y-1">
                {repositories.map((repo) => (
                  <div key={repo.id} className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={12}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="truncate">{repo.displayName}</span>
                    {repo.currentProjectName && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        from: {repo.currentProjectName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Project list */}
          <ScrollArea className="h-64 -mx-2 px-2">
            {projectsLoading ? (
              <div className="flex items-center justify-center py-8">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={20}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? 'No projects match your search'
                  : 'No other projects available'}
              </div>
            ) : (
              <RadioGroup
                value={selectedProjectId ?? ''}
                onValueChange={(v) => setSelectedProjectId(v as string)}
                className="space-y-2"
              >
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-start space-x-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <RadioGroupItem
                      value={project.id}
                      id={project.id}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={project.id}
                        className="font-medium cursor-pointer"
                      >
                        {project.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {project.repositories.length} repositories
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            )}
          </ScrollArea>

          {/* Create new project option */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setCreateProjectOpen(true)}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} data-slot="icon" />
            Create new project...
          </Button>

          {/* Current project info */}
          {isSingleRepo && repositories[0]?.currentProjectName && (
            <p className="text-xs text-muted-foreground">
              Currently in: <strong>{repositories[0].currentProjectName}</strong>{' '}
              (will be unlinked)
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isMoving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={!selectedProjectId || isMoving}
            >
              {isMoving ? (
                <>
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    className="animate-spin"
                  />
                  Moving...
                </>
              ) : isSingleRepo ? (
                'Move'
              ) : (
                `Move ${repositories.length} Repos`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create project modal */}
      <CreateProjectModalSimple
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(newProject) => {
          // Select the newly created project
          setSelectedProjectId(newProject.id)
          setCreateProjectOpen(false)
        }}
      />
    </>
  )
}
