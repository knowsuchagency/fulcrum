import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useRepositories,
  useCreateRepository,
  useDeleteRepository,
} from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  Delete02Icon,
  PlusSignIcon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  CommandLineIcon,
  Copy01Icon,
  VisualStudioCodeIcon,
} from '@hugeicons/core-free-icons'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { useDefaultGitReposDir, useHostname, useSshPort } from '@/hooks/use-config'
import { buildVSCodeUrl } from '@/lib/vscode-url'
import type { Repository } from '@/types'

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesView,
})

function RepositoryCard({
  repository,
  onDelete,
}: {
  repository: Repository
  onDelete: () => Promise<void>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { data: hostname } = useHostname()
  const { data: sshPort } = useSshPort()

  const handleOpenVSCode = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = buildVSCodeUrl(repository.path, hostname, sshPort)
    window.open(url, '_blank')
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDeleting(true)
    try {
      await onDelete()
      setDialogOpen(false)
    } catch {
      // Keep dialog open on error
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Link to="/repositories/$repoId" params={{ repoId: repository.id }}>
      <Card className="transition-colors hover:border-border/80 cursor-pointer">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="min-w-0 space-y-2 overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{repository.displayName}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleOpenVSCode}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Open in VS Code"
              >
                <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} />
              </Button>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Folder01Icon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate font-mono">{repository.path}</span>
              </div>

              {repository.startupScript && (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={CommandLineIcon}
                    size={12}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <span className="truncate font-mono">{repository.startupScript}</span>
                </div>
              )}

              {repository.copyFiles && (
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate font-mono">{repository.copyFiles}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end" onClick={(e) => e.preventDefault()}>
            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
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
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="gap-2"
                  >
                    {isDeleting && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={14}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                    )}
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function CreateRepositoryDialog() {
  const [open, setOpen] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [path, setPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')

  const createRepository = useCreateRepository()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()

  const handlePathSelect = (selectedPath: string) => {
    setPath(selectedPath)
    // Auto-fill display name from folder name
    if (!displayName) {
      setDisplayName(selectedPath.split('/').pop() || '')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!path.trim()) return

    createRepository.mutate(
      {
        path: path.trim(),
        displayName: displayName.trim() || path.split('/').pop() || 'repo',
        startupScript: startupScript.trim() || null,
        copyFiles: copyFiles.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setPath('')
          setDisplayName('')
          setStartupScript('')
          setCopyFiles('')
        },
      }
    )
  }

  const folderName = path ? path.split('/').pop() : ''

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" />}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
          Add Repository
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add Repository</DialogTitle>
              <DialogDescription>
                Add a git repository for quick access when creating tasks.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field>
                <FieldLabel>Repository Path</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  onClick={() => setBrowserOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={14}
                    strokeWidth={2}
                    className="mr-2"
                  />
                  {folderName ? (
                    <span className="truncate">{path}</span>
                  ) : (
                    <span className="text-muted-foreground">Select repository...</span>
                  )}
                </Button>
              </Field>

              <Field>
                <FieldLabel htmlFor="displayName">Display Name</FieldLabel>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={folderName || 'My Project'}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="startupScript">Startup Script</FieldLabel>
                <Textarea
                  id="startupScript"
                  value={startupScript}
                  onChange={(e) => setStartupScript(e.target.value)}
                  placeholder="npm install && npm run dev"
                  rows={2}
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

            <DialogFooter className="mt-4">
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={createRepository.isPending || !path.trim()}>
                {createRepository.isPending ? 'Adding...' : 'Add Repository'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handlePathSelect}
        initialPath={defaultGitReposDir || undefined}
      />
    </>
  )
}

function RepositoriesView() {
  const { data: repositories, isLoading, error } = useRepositories()
  const deleteRepository = useDeleteRepository()

  const handleDelete = async (id: string) => {
    await deleteRepository.mutateAsync(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-medium">Repositories</h1>
          {repositories && (
            <div className="text-xs text-muted-foreground">{repositories.length} total</div>
          )}
        </div>

        <CreateRepositoryDialog />
      </div>

      <div className="pixel-grid flex-1 overflow-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={24}
              strokeWidth={2}
              className="animate-spin text-muted-foreground"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 py-6 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
            <span className="text-sm">Failed to load repositories: {error.message}</span>
          </div>
        )}

        {!isLoading && !error && repositories?.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">
              No repositories added yet. Add a repository for quick access when creating tasks.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {repositories?.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repository={repo}
              onDelete={() => handleDelete(repo.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
