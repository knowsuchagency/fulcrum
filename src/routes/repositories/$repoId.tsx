import { useState, useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRepository, useUpdateRepository, useDeleteRepository } from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft02Icon,
  Delete02Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  VisualStudioCodeIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { useHostname, useSshPort } from '@/hooks/use-config'
import { buildVSCodeUrl } from '@/lib/vscode-url'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'

export const Route = createFileRoute('/repositories/$repoId')({
  component: RepositoryDetailView,
})

function RepositoryDetailView() {
  const { repoId } = Route.useParams()
  const navigate = useNavigate()
  const { data: repository, isLoading, error } = useRepository(repoId)
  const updateRepository = useUpdateRepository()
  const deleteRepository = useDeleteRepository()
  const { data: hostname } = useHostname()
  const { data: sshPort } = useSshPort()

  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  // Initialize form state when repository loads
  useEffect(() => {
    if (repository) {
      setDisplayName(repository.displayName)
      setStartupScript(repository.startupScript || '')
      setCopyFiles(repository.copyFiles || '')
      setHasChanges(false)
    }
  }, [repository])

  // Track changes
  useEffect(() => {
    if (repository) {
      const changed =
        displayName !== repository.displayName ||
        startupScript !== (repository.startupScript || '') ||
        copyFiles !== (repository.copyFiles || '')
      setHasChanges(changed)
    }
  }, [displayName, startupScript, copyFiles, repository])

  const handleSave = () => {
    if (!repository) return

    updateRepository.mutate({
      id: repository.id,
      updates: {
        displayName: displayName.trim() || repository.path.split('/').pop() || 'repo',
        startupScript: startupScript.trim() || null,
        copyFiles: copyFiles.trim() || null,
      },
    })
  }

  const handleDelete = async () => {
    if (!repository) return
    await deleteRepository.mutateAsync(repository.id)
    navigate({ to: '/repositories' })
  }

  const handleOpenVSCode = () => {
    if (!repository) return
    const url = buildVSCodeUrl(repository.path, hostname, sshPort)
    window.open(url, '_blank')
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          strokeWidth={2}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <Link to="/repositories" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2} />
            Repositories
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
            <span className="text-sm">Repository not found</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Link to="/repositories" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2} />
            Repositories
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{repository.displayName}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTaskModalOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Start Task"
          >
            <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={2} />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleOpenVSCode}
            className="text-muted-foreground hover:text-foreground"
            title="Open in VS Code"
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                />
              }
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Repository</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove "{repository.displayName}" from Vibora. The actual repository
                  files will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="destructive" onClick={handleDelete}>
                  Delete
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateRepository.isPending}
          >
            {updateRepository.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
            <span className="font-mono">{repository.path}</span>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="displayName">Display Name</FieldLabel>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={repository.path.split('/').pop() || 'My Project'}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="startupScript">Startup Script</FieldLabel>
              <Textarea
                id="startupScript"
                value={startupScript}
                onChange={(e) => setStartupScript(e.target.value)}
                placeholder="npm install && npm run dev"
                rows={3}
              />
              <FieldDescription>
                Command to run in the terminal when creating a worktree.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="copyFiles">Copy Files</FieldLabel>
              <Input
                id="copyFiles"
                value={copyFiles}
                onChange={(e) => setCopyFiles(e.target.value)}
                placeholder=".env, config.local.json"
              />
              <FieldDescription>
                Comma-separated glob patterns for files to copy into new worktrees.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </div>

      <CreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultRepository={repository}
      />
    </div>
  )
}
