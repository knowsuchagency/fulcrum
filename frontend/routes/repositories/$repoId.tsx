import { useState, useEffect, useCallback } from 'react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Folder01Icon,
  Loading03Icon,
  Alert02Icon,
  VisualStudioCodeIcon,
  TaskAdd01Icon,
  ComputerTerminal01Icon,
  Tick02Icon,
  GridViewIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { useOpenInTerminal } from '@/hooks/use-open-in-terminal'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { FilesViewer } from '@/components/viewer/files-viewer'

type RepoTab = 'settings' | 'files'

interface RepoDetailSearch {
  tab?: RepoTab
}

export const Route = createFileRoute('/repositories/$repoId')({
  component: RepositoryDetailView,
  validateSearch: (search: Record<string, unknown>): RepoDetailSearch => ({
    tab: search.tab === 'files' ? 'files' : undefined,
  }),
})

function RepositoryDetailView() {
  const { repoId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { data: repository, isLoading, error } = useRepository(repoId)
  const updateRepository = useUpdateRepository()
  const deleteRepository = useDeleteRepository()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()
  const { openInTerminal } = useOpenInTerminal()

  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [isCopierTemplate, setIsCopierTemplate] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)

  const activeTab = tab || 'settings'

  const setActiveTab = useCallback(
    (newTab: RepoTab) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: newTab === 'settings' ? {} : { tab: newTab },
        replace: true,
      })
    },
    [navigate, repoId]
  )

  // Initialize form state when repository loads
  useEffect(() => {
    if (repository) {
      setDisplayName(repository.displayName)
      setStartupScript(repository.startupScript || '')
      setCopyFiles(repository.copyFiles || '')
      setIsCopierTemplate(repository.isCopierTemplate ?? false)
      setHasChanges(false)
    }
  }, [repository])

  // Track changes
  useEffect(() => {
    if (repository) {
      const changed =
        displayName !== repository.displayName ||
        startupScript !== (repository.startupScript || '') ||
        copyFiles !== (repository.copyFiles || '') ||
        isCopierTemplate !== (repository.isCopierTemplate ?? false)
      setHasChanges(changed)
    }
  }, [displayName, startupScript, copyFiles, isCopierTemplate, repository])

  const handleSave = () => {
    if (!repository) return

    updateRepository.mutate(
      {
        id: repository.id,
        updates: {
          displayName: displayName.trim() || repository.path.split('/').pop() || 'repo',
          startupScript: startupScript.trim() || null,
          copyFiles: copyFiles.trim() || null,
          isCopierTemplate,
        },
      },
      {
        onSuccess: () => {
          toast.success('Repository saved')
          setHasChanges(false)
        },
        onError: (error) => {
          toast.error('Failed to save repository', {
            description: error instanceof Error ? error.message : 'Unknown error',
          })
        },
      }
    )
  }

  const handleDelete = async () => {
    if (!repository) return
    await deleteRepository.mutateAsync(repository.id)
    navigate({ to: '/repositories' })
  }

  const handleOpenEditor = () => {
    if (!repository) return
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleOpenInTerminal = () => {
    if (!repository) return
    openInTerminal(repository.path, repository.displayName)
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
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
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
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <span className="text-sm font-medium">{repository.displayName}</span>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTaskModalOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={TaskAdd01Icon} size={16} strokeWidth={2} data-slot="icon" className="-translate-y-px" />
            <span className="max-sm:hidden">New Task</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInTerminal}
            className="text-muted-foreground hover:text-foreground"
            title="Open in Terminal"
          >
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={16} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Terminal</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/tasks', search: { repo: repository.displayName } })}
            className="text-muted-foreground hover:text-foreground"
            title="View Tasks"
          >
            <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Tasks</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenEditor}
            className="text-muted-foreground hover:text-foreground"
            title={`Open in ${getEditorDisplayName(editorApp)}`}
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Editor</span>
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
              <span className="max-sm:hidden">Delete</span>
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
            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{updateRepository.isPending ? 'Saving...' : 'Save'}</span>
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as RepoTab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border px-4">
          <TabsList variant="line">
            <TabsTrigger value="settings" className="px-3 py-1.5">Settings</TabsTrigger>
            <TabsTrigger value="files" className="px-3 py-1.5">Files</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <div className="mx-auto max-w-xl space-y-6 bg-card rounded-lg p-6 border border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                  <span className="font-mono break-all">{repository.path}</span>
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

                  <Field>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isCopierTemplate}
                        onCheckedChange={(checked) => setIsCopierTemplate(checked === true)}
                      />
                      <FieldLabel className="cursor-pointer">Use as Copier Template</FieldLabel>
                    </div>
                    <FieldDescription>
                      Mark as a template for creating new projects with Copier.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
          <FilesViewer worktreePath={repository.path} readOnly />
        </TabsContent>
      </Tabs>

      <CreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultRepository={repository}
        showTrigger={false}
      />
    </div>
  )
}
