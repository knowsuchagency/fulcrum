import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { reaction } from 'mobx'
import { useProject, useDeleteProject, useAccessProject, useUpdateProject } from '@/hooks/use-projects'
import { useUpdateRepository } from '@/hooks/use-repositories'
import {
  useStopApp,
  useCancelDeployment,
  useAppLogs,
  useDeployments,
  useAppStatus,
  useUpdateApp,
  useComposeFile,
  useWriteComposeFile,
  useSyncServices,
  useDeploymentPrerequisites,
  useDeploymentSettings,
  useFindCompose,
} from '@/hooks/use-apps'
import { useDeploymentStore, DeploymentStoreProvider, type DeploymentStage } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  PlayIcon,
  StopIcon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Copy01Icon,
  PencilEdit02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Menu01Icon,
  ViewOffIcon,
  EyeIcon,
  GridViewIcon,
  Rocket01Icon,
  TextIcon,
  Chart02Icon,
  WindowsOldIcon,
  Folder01Icon,
  TaskAdd01Icon,
  VisualStudioCodeIcon,
  Tick02Icon,
  Link01Icon,
  GithubIcon,
  Settings05Icon,
  PackageAddIcon,
} from '@hugeicons/core-free-icons'
import { MonacoEditor } from '@/components/viewer/monaco-editor'
import type { Deployment, ExposureMethod, ProjectWithDetails } from '@/types'
import { AGENT_DISPLAY_NAMES, type AgentType } from '@/types'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'
import { toast } from 'sonner'
import { useDockerStats, type ContainerStats } from '@/hooks/use-monitoring'
import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { WorkspacePanel } from '@/components/workspace/workspace-panel'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, openExternalUrl } from '@/lib/editor-url'
import { AgentOptionsEditor } from '@/components/repositories/agent-options-editor'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { ModelPicker } from '@/components/opencode/model-picker'
import { useQuery } from '@tanstack/react-query'

type ProjectTab = 'general' | 'app' | 'deployments' | 'logs' | 'monitoring' | 'workspace'

interface ProjectDetailSearch {
  tab?: ProjectTab
  action?: 'deploy'
  file?: string
}

// Wrap with DeploymentStoreProvider for app deployment state
function ProjectDetailViewWithProvider() {
  return (
    <DeploymentStoreProvider>
      <ProjectDetailView />
    </DeploymentStoreProvider>
  )
}

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailViewWithProvider,
  validateSearch: (search: Record<string, unknown>): ProjectDetailSearch => ({
    tab: ['general', 'app', 'deployments', 'logs', 'monitoring', 'workspace'].includes(search.tab as string)
      ? (search.tab as ProjectTab)
      : undefined,
    action: search.action === 'deploy' ? 'deploy' : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
})

// Helper functions
function formatDuration(startedAt: string, completedAt?: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

function formatRelativeTime(date: string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `about ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `about ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `about ${days}d ago`
}

function gitUrlToHttps(url: string): string {
  const sshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }
  return url.replace(/\.git$/, '')
}

function useGitRemoteUrl(repoPath: string | undefined) {
  return useQuery({
    queryKey: ['git-remote', repoPath],
    queryFn: async () => {
      if (!repoPath) return null
      const res = await fetch(`/api/git/remote?path=${encodeURIComponent(repoPath)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.remoteUrl as string | null
    },
    enabled: !!repoPath,
    staleTime: 60 * 1000,
  })
}

const ProjectDetailView = observer(function ProjectDetailView() {
  const { t } = useTranslation('projects')
  const tCommon = useTranslation('common').t
  const { projectId } = Route.useParams()
  const { tab, action, file } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: project, isLoading, error } = useProject(projectId)
  const { data: prereqs } = useDeploymentPrerequisites()
  const deleteProject = useDeleteProject()
  const accessProject = useAccessProject()
  const stopApp = useStopApp()
  const cancelDeployment = useCancelDeployment()
  const activeTab = tab || 'general'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteDirectory, setDeleteDirectory] = useState(false)
  const [deleteApp, setDeleteApp] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const updateProject = useUpdateProject()
  const nameInputRef = useRef<HTMLInputElement>(null)

  const deployStore = useDeploymentStore()
  const [showStreamingLogs, setShowStreamingLogs] = useState(false)
  const isBuilding = deployStore.isDeploying || project?.app?.status === 'building'

  // Update last accessed when viewing project
  useEffect(() => {
    if (projectId) {
      accessProject.mutate(projectId)
    }
  }, [projectId])

  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  const handleOpenEditor = () => {
    if (!project?.repository?.path) return
    const url = buildEditorUrl(project.repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleDeploy = useCallback(() => {
    if (project?.app) {
      deployStore.deploy(project.app.id)
      setShowStreamingLogs(true)
    }
  }, [project?.app, deployStore])

  const handleStreamingLogsClose = useCallback((open: boolean) => {
    setShowStreamingLogs(open)
    if (!open && !deployStore.isDeploying && deployStore.logs.length === 0 && !deployStore.error) {
      setTimeout(() => deployStore.reset(), 300)
    }
  }, [deployStore])

  const handleStartEditName = useCallback(() => {
    if (project) {
      setEditedName(project.name)
      setIsEditingName(true)
      setTimeout(() => nameInputRef.current?.select(), 0)
    }
  }, [project])

  const handleSaveName = useCallback(() => {
    const trimmedName = editedName.trim()
    if (trimmedName && trimmedName !== project?.name) {
      updateProject.mutate({ id: projectId, updates: { name: trimmedName } })
    }
    setIsEditingName(false)
  }, [editedName, project?.name, projectId, updateProject])

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false)
    setEditedName('')
  }, [])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveName()
    } else if (e.key === 'Escape') {
      handleCancelEditName()
    }
  }, [handleSaveName, handleCancelEditName])

  const actionConsumedRef = useRef(false)

  useEffect(() => {
    if (action === 'deploy' && project?.app && !actionConsumedRef.current && !deployStore.isDeploying) {
      actionConsumedRef.current = true
      navigate({
        to: '/projects/$projectId',
        params: { projectId },
        search: tab ? { tab } : {},
        replace: true,
      })
      deployStore.deploy(project.app.id)
      setShowStreamingLogs(true)
    }
  }, [action, project?.app, projectId, deployStore, navigate, tab])

  useEffect(() => {
    actionConsumedRef.current = false
  }, [projectId])

  const showDnsWarning = prereqs && !prereqs.settings.cloudflareConfigured

  const setActiveTab = useCallback(
    (newTab: ProjectTab) => {
      navigate({
        to: '/projects/$projectId',
        params: { projectId },
        search: newTab === 'general' ? {} : newTab === 'workspace' ? { tab: newTab, file } : { tab: newTab },
        replace: true,
      })
    },
    [navigate, projectId, file]
  )

  const handleFileChange = useCallback(
    (newFile: string | null) => {
      navigate({
        to: '/projects/$projectId',
        params: { projectId },
        search: { tab: 'workspace', file: newFile ?? undefined },
        replace: true,
      })
    },
    [navigate, projectId]
  )

  const handleFileSaved = useCallback(
    (savedFile: string) => {
      if (project?.repository?.path && project?.app?.composeFile) {
        const composeFileName = project.app.composeFile
        if (savedFile === composeFileName || savedFile.endsWith(`/${composeFileName}`)) {
          queryClient.invalidateQueries({
            queryKey: ['compose', 'file', project.repository.path, project.app.composeFile],
          })
        }
      }
    },
    [project?.repository?.path, project?.app?.composeFile, queryClient]
  )

  const handleDelete = async () => {
    await deleteProject.mutateAsync({
      id: projectId,
      deleteDirectory,
      deleteApp,
    })
    navigate({ to: '/projects' })
  }

  const handleStop = async () => {
    if (!project?.app) return
    await stopApp.mutateAsync(project.app.id)
  }

  const handleCancelDeploy = async () => {
    if (!project?.app) return
    await cancelDeployment.mutateAsync(project.app.id)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={48} strokeWidth={1.5} className="text-destructive" />
        <p className="text-muted-foreground">{error?.message ?? t('detailView.notFound')}</p>
        <Link to="/projects">
          <Button variant="outline">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
            {t('detailView.breadcrumb')}
          </Button>
        </Link>
      </div>
    )
  }

  const hasApp = !!project.app
  const appStatus = project.app?.status
  const isRunning = appStatus === 'running'

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProjectTab)} className="flex h-full flex-col">
        {/* Header bar - tabs on left, project info + actions on right */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 py-2">
          {/* Mobile: hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 sm:hidden">
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={2} />
              <span className="text-sm font-medium">{t(`detailView.tabs.${activeTab}`)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setActiveTab('general')} className="gap-2">
                <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} />
                {t('detailView.tabs.general')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('app')} className="gap-2">
                <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
                {t('detailView.tabs.app')}
              </DropdownMenuItem>
              {hasApp && (
                <>
                  <DropdownMenuItem onClick={() => setActiveTab('deployments')} className="gap-2">
                    <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
                    {t('detailView.tabs.deployments')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('logs')} className="gap-2">
                    <HugeiconsIcon icon={TextIcon} size={14} strokeWidth={2} />
                    {t('detailView.tabs.logs')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('monitoring')} className="gap-2">
                    <HugeiconsIcon icon={Chart02Icon} size={14} strokeWidth={2} />
                    {t('detailView.tabs.monitoring')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setActiveTab('workspace')} className="gap-2">
                <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} />
                {t('detailView.tabs.workspace')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop: tabs */}
          <TabsList variant="line" className="hidden sm:inline-flex">
            <TabsTrigger value="general" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={Settings05Icon} size={14} strokeWidth={2} />
              {t('detailView.tabs.general')}
            </TabsTrigger>
            <TabsTrigger value="app" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
              {t('detailView.tabs.app')}
            </TabsTrigger>
            {hasApp && (
              <>
                <TabsTrigger value="deployments" className="gap-1.5 px-3 py-1.5">
                  <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} />
                  {t('detailView.tabs.deployments')}
                </TabsTrigger>
                <TabsTrigger value="logs" className="gap-1.5 px-3 py-1.5">
                  <HugeiconsIcon icon={TextIcon} size={14} strokeWidth={2} />
                  {t('detailView.tabs.logs')}
                </TabsTrigger>
                <TabsTrigger value="monitoring" className="gap-1.5 px-3 py-1.5">
                  <HugeiconsIcon icon={Chart02Icon} size={14} strokeWidth={2} />
                  {t('detailView.tabs.monitoring')}
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="workspace" className="gap-1.5 px-3 py-1.5">
              <HugeiconsIcon icon={WindowsOldIcon} size={14} strokeWidth={2} />
              {t('detailView.tabs.workspace')}
            </TabsTrigger>
          </TabsList>

          {/* Right side: actions + project info */}
          <div className="flex items-center gap-2">
            {/* Deploy/Stop buttons (only if app exists) */}
            {hasApp && (
              <>
                <Button size="sm" onClick={handleDeploy} disabled={isBuilding}>
                  {isBuilding ? (
                    <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
                  )}
                  <span className="hidden sm:inline">
                    {deployStore.isDeploying ? tCommon('apps.deploying') : appStatus === 'building' ? tCommon('apps.building') : t('deploy')}
                  </span>
                </Button>
                {isBuilding ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancelDeploy}
                    disabled={cancelDeployment.isPending}
                  >
                    {cancelDeployment.isPending ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                    )}
                    <span className="hidden sm:inline">
                      {cancelDeployment.isPending ? tCommon('apps.cancelling') : tCommon('apps.cancelDeploy')}
                    </span>
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStop}
                    disabled={stopApp.isPending || !isRunning}
                  >
                    {stopApp.isPending ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                    )}
                    <span className="hidden sm:inline">{t('stop')}</span>
                  </Button>
                )}
                <div className="h-4 w-px bg-border mx-1" />
              </>
            )}

            {/* Quick actions */}
            {project.repository && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTaskModalOpen(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={TaskAdd01Icon} size={14} strokeWidth={2} data-slot="icon" />
                  <span className="hidden sm:inline">{t('newTask', { ns: 'projects' })}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenEditor}
                  className="text-muted-foreground hover:text-foreground hidden sm:flex"
                >
                  <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
                </Button>
                <div className="h-4 w-px bg-border mx-1" />
              </>
            )}

            {/* Project info */}
            {project.repository && <GitStatusBadge worktreePath={project.repository.path} />}
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleNameKeyDown}
                className="font-medium text-sm bg-transparent border-b border-primary outline-none px-0.5 min-w-[100px]"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={handleStartEditName}
                className="font-medium text-sm hover:text-primary transition-colors cursor-pointer"
                title="Click to edit"
              >
                {project.name}
              </button>
            )}
            {hasApp && (
              <div
                className={`h-2 w-2 rounded-full ${
                  appStatus === 'running' ? 'bg-green-500' :
                  appStatus === 'building' ? 'bg-yellow-500' :
                  appStatus === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                }`}
                title={appStatus}
              />
            )}
            {showDnsWarning && hasApp && (
              <Tooltip>
                <TooltipTrigger className="p-1 text-amber-500 hover:text-amber-400 transition-colors">
                  <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">{tCommon('apps.manualDnsRequired')}</p>
                  <p className="text-muted-foreground mt-1">{tCommon('apps.manualDnsRequiredDesc')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-auto ${activeTab === 'workspace' ? '' : 'p-4'}`}>
          <TabsContent value="general" className="mt-0 h-full">
            <GeneralTab project={project} />
          </TabsContent>

          <TabsContent value="app" className="mt-0">
            <AppTab project={project} onDeploy={handleDeploy} />
          </TabsContent>

          {hasApp && (
            <>
              <TabsContent value="deployments" className="mt-0">
                <DeploymentsTab
                  appId={project.app!.id}
                  deployStore={deployStore}
                  onViewStreamingLogs={() => setShowStreamingLogs(true)}
                />
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <LogsTab appId={project.app!.id} services={project.app!.services} />
              </TabsContent>

              <TabsContent value="monitoring" className="mt-0">
                <MonitoringTab appId={project.app!.id} repoDisplayName={project.repository?.displayName} />
              </TabsContent>
            </>
          )}

          <TabsContent value="workspace" className="mt-0 h-full">
            {project.repository?.path ? (
              <WorkspacePanel
                repoPath={project.repository.path}
                repoDisplayName={project.repository.displayName}
                activeTab={activeTab}
                file={file}
                onFileChange={handleFileChange}
                onFileSaved={handleFileSaved}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <p className="text-muted-foreground">{t('detailView.general.noRepository')}</p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Streaming deployment logs modal */}
      {project.app && (
        <StreamingDeploymentModal
          appId={project.app.id}
          open={showStreamingLogs}
          onOpenChange={handleStreamingLogsClose}
        />
      )}

      {/* Task modal */}
      {project.repository && (
        <CreateTaskModal
          open={taskModalOpen}
          onOpenChange={setTaskModalOpen}
          defaultRepository={{
            id: project.repository.id,
            path: project.repository.path,
            displayName: project.repository.displayName,
            startupScript: project.repository.startupScript,
            copyFiles: project.repository.copyFiles,
            claudeOptions: project.repository.claudeOptions,
            opencodeOptions: project.repository.opencodeOptions,
            opencodeModel: project.repository.opencodeModel,
            defaultAgent: project.repository.defaultAgent,
            remoteUrl: project.repository.remoteUrl,
            isCopierTemplate: project.repository.isCopierTemplate,
            createdAt: '',
            updatedAt: '',
          }}
          showTrigger={false}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.description', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {project.repository && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="deleteDirectory"
                  checked={deleteDirectory}
                  onCheckedChange={(checked) => setDeleteDirectory(checked === true)}
                />
                <label htmlFor="deleteDirectory" className="text-sm">
                  {t('delete.alsoDeleteDirectory')}
                </label>
              </div>
            )}
            {project.app && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="deleteApp"
                  checked={deleteApp}
                  onCheckedChange={(checked) => setDeleteApp(checked === true)}
                />
                <label htmlFor="deleteApp" className="text-sm">
                  {t('delete.alsoDeleteApp')}
                </label>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('apps.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProject.isPending ? t('delete.deleting') : t('delete.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})

// General tab - Repository settings + Agent config
function GeneralTab({ project }: { project: ProjectWithDetails }) {
  const { t } = useTranslation('projects')
  const tRepo = useTranslation('repositories').t
  const updateRepository = useUpdateRepository()
  const { data: remoteUrl } = useGitRemoteUrl(project.repository?.path)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [claudeOptions, setClaudeOptions] = useState<Record<string, string>>({})
  const [opencodeOptions, setOpencodeOptions] = useState<Record<string, string>>({})
  const [opencodeModel, setOpencodeModel] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<AgentType | null>(null)
  const [isCopierTemplate, setIsCopierTemplate] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const repository = project.repository

  // Initialize form state
  useEffect(() => {
    if (repository) {
      setDisplayName(repository.displayName)
      setStartupScript(repository.startupScript || '')
      setCopyFiles(repository.copyFiles || '')
      setClaudeOptions(repository.claudeOptions || {})
      setOpencodeOptions(repository.opencodeOptions || {})
      setOpencodeModel(repository.opencodeModel ?? null)
      setDefaultAgent(repository.defaultAgent ?? null)
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
        JSON.stringify(claudeOptions) !== JSON.stringify(repository.claudeOptions || {}) ||
        JSON.stringify(opencodeOptions) !== JSON.stringify(repository.opencodeOptions || {}) ||
        opencodeModel !== (repository.opencodeModel ?? null) ||
        defaultAgent !== (repository.defaultAgent ?? null) ||
        isCopierTemplate !== (repository.isCopierTemplate ?? false)
      setHasChanges(changed)
    }
  }, [displayName, startupScript, copyFiles, claudeOptions, opencodeOptions, opencodeModel, defaultAgent, isCopierTemplate, repository])

  const handleSave = () => {
    if (!repository) return

    updateRepository.mutate(
      {
        id: repository.id,
        updates: {
          displayName: displayName.trim() || repository.path.split('/').pop() || 'repo',
          startupScript: startupScript.trim() || null,
          copyFiles: copyFiles.trim() || null,
          claudeOptions: Object.keys(claudeOptions).length > 0 ? claudeOptions : null,
          opencodeOptions: Object.keys(opencodeOptions).length > 0 ? opencodeOptions : null,
          opencodeModel,
          defaultAgent,
          isCopierTemplate,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('detailView.save'))
          setHasChanges(false)
        },
        onError: (error) => {
          toast.error('Failed to save', {
            description: error instanceof Error ? error.message : 'Unknown error',
          })
        },
      }
    )
  }

  if (!repository) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p>{t('detailView.general.noRepository')}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl mx-auto">
        {/* Repository path header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
          <span className="font-mono break-all">{repository.path}</span>
          {remoteUrl && (
            <a
              href={gitUrlToHttps(remoteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={remoteUrl}
            >
              <HugeiconsIcon
                icon={remoteUrl.includes('github.com') ? GithubIcon : Link01Icon}
                size={14}
                strokeWidth={2}
              />
            </a>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left column: General settings */}
          <div className="flex-1 bg-card rounded-lg p-6 border border-border">
            <h3 className="text-sm font-medium mb-4">{t('detailView.general.repositoryTitle')}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="displayName">{t('detailView.general.displayName')}</FieldLabel>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={repository.path.split('/').pop() || 'My Project'}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="startupScript">{t('detailView.general.startupScript')}</FieldLabel>
                <Textarea
                  id="startupScript"
                  value={startupScript}
                  onChange={(e) => setStartupScript(e.target.value)}
                  placeholder={tRepo('detailView.settings.startupScriptPlaceholder')}
                  rows={3}
                />
                <FieldDescription>
                  {tRepo('detailView.settings.startupScriptDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="copyFiles">{t('detailView.general.copyFiles')}</FieldLabel>
                <Input
                  id="copyFiles"
                  value={copyFiles}
                  onChange={(e) => setCopyFiles(e.target.value)}
                  placeholder={tRepo('detailView.settings.copyFilesPlaceholder')}
                />
                <FieldDescription>
                  {tRepo('detailView.settings.copyFilesDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isCopierTemplate}
                    onCheckedChange={(checked) => setIsCopierTemplate(checked === true)}
                  />
                  <FieldLabel className="cursor-pointer">{tRepo('detailView.settings.isCopierTemplate')}</FieldLabel>
                </div>
                <FieldDescription>
                  {tRepo('detailView.settings.isCopierTemplateDescription')}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>

          {/* Right column: Agent settings */}
          <div className="flex-1 bg-card rounded-lg p-6 border border-border">
            <h3 className="text-sm font-medium mb-4">{t('detailView.general.agentTitle')}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel>{t('detailView.general.defaultAgent')}</FieldLabel>
                <Select
                  value={defaultAgent ?? 'inherit'}
                  onValueChange={(value) => setDefaultAgent(value === 'inherit' ? null : value as AgentType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="inherit">
                      {tRepo('detailView.settings.defaultAgentInherit')}
                    </SelectItem>
                    {(Object.keys(AGENT_DISPLAY_NAMES) as AgentType[]).map((agentType) => (
                      <SelectItem key={agentType} value={agentType}>
                        {AGENT_DISPLAY_NAMES[agentType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {tRepo('detailView.settings.defaultAgentDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('detailView.general.claudeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {tRepo('detailView.settings.claudeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={claudeOptions}
                  onChange={setClaudeOptions}
                />
              </Field>

              <Field>
                <FieldLabel>{t('detailView.general.opencodeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {tRepo('detailView.settings.opencodeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={opencodeOptions}
                  onChange={setOpencodeOptions}
                />
              </Field>

              <Field>
                <FieldLabel>{t('detailView.general.opencodeModel')}</FieldLabel>
                <ModelPicker
                  value={opencodeModel}
                  onChange={setOpencodeModel}
                  placeholder={tRepo('detailView.settings.opencodeModelPlaceholder')}
                />
                <FieldDescription>
                  {tRepo('detailView.settings.opencodeModelDescription')}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end mt-4">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateRepository.isPending}
          >
            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} data-slot="icon" />
            {updateRepository.isPending ? t('detailView.saving') : t('detailView.save')}
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}

// App tab - App configuration or "Add app" prompt
function AppTab({ project, onDeploy }: { project: ProjectWithDetails; onDeploy: () => void }) {
  const { t } = useTranslation('projects')
  const tRepo = useTranslation('repositories').t
  const navigate = useNavigate()
  const { data: composeInfo, isLoading: composeLoading } = useFindCompose(project.repository?.id ?? null)
  const [composeWarningOpen, setComposeWarningOpen] = useState(false)

  const handleCreateApp = () => {
    if (composeLoading) return
    if (!composeInfo?.found) {
      setComposeWarningOpen(true)
    } else {
      navigate({ to: '/apps/new', search: { repoId: project.repository?.id } })
    }
  }

  if (!project.app) {
    return (
      <div className="max-w-2xl">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{t('detailView.app.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('detailView.app.noApp')}</p>
        </div>

        {project.repository && (
          <div className="border rounded-lg p-6 text-center">
            <HugeiconsIcon icon={Rocket01Icon} size={32} strokeWidth={1.5} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{t('detailView.app.addAppDescription')}</p>
            <Button onClick={handleCreateApp} disabled={composeLoading}>
              <HugeiconsIcon icon={PackageAddIcon} size={16} strokeWidth={2} data-slot="icon" />
              {t('detailView.app.addApp')}
            </Button>
          </div>
        )}

        <Dialog open={composeWarningOpen} onOpenChange={setComposeWarningOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tRepo('createAppDialog.title')}</DialogTitle>
              <DialogDescription>
                {tRepo('createAppDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm">
              {tRepo('createAppDialog.instructions')}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setComposeWarningOpen(false)}>
                {tRepo('createAppDialog.close')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Has app - show app config
  return (
    <div className="space-y-4 max-w-4xl">
      {/* Top row: Deploy options + Services side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DeployOptionsSection app={project.app} />
        <ServicesSection app={project.app} onDeploy={onDeploy} />
      </div>

      {/* Environment section - full width */}
      <EnvironmentSection app={project.app} />

      {/* Compose file editor */}
      {project.repository?.path && (
        <ComposeFileEditor app={project.app} repoPath={project.repository.path} />
      )}
    </div>
  )
}

// Deploy options section
function DeployOptionsSection({ app }: { app: NonNullable<ProjectWithDetails['app']> }) {
  const { t } = useTranslation('projects')
  const updateApp = useUpdateApp()

  const handleAutoDeployToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { autoDeployEnabled: enabled },
    })
  }

  const handleNoCacheToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { noCacheBuild: enabled },
    })
  }

  const handleNotificationsToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { notificationsEnabled: enabled },
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('detailView.app.deployOptions')}</h4>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={app.autoDeployEnabled ?? false}
            onCheckedChange={(checked) => handleAutoDeployToggle(checked === true)}
          />
          <span>{t('detailView.app.autoDeployEnabled')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={app.noCacheBuild ?? false}
            onCheckedChange={(checked) => handleNoCacheToggle(checked === true)}
          />
          <span>{t('detailView.app.noCacheBuild')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={app.notificationsEnabled ?? true}
            onCheckedChange={(checked) => handleNotificationsToggle(checked === true)}
          />
          <span>{t('detailView.app.notificationsEnabled')}</span>
        </label>
      </div>
    </div>
  )
}

// Services section
function ServicesSection({
  app,
  onDeploy,
}: {
  app: NonNullable<ProjectWithDetails['app']>
  onDeploy: () => void
}) {
  const { t } = useTranslation('projects')
  const tCommon = useTranslation('common').t
  const { data: status } = useAppStatus(app.id)
  const { data: deploymentSettings } = useDeploymentSettings()
  const updateApp = useUpdateApp()
  const tunnelsAvailable = deploymentSettings?.tunnelsAvailable ?? false

  const [services, setServices] = useState(
    app.services?.map((s) => ({
      serviceName: s.serviceName,
      containerPort: s.containerPort,
      domain: s.domain ?? '',
      exposureMethod: (s.exposureMethod ?? 'dns') as ExposureMethod,
    })) ?? []
  )
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (editingIndex === null) {
      setServices(
        app.services?.map((s) => ({
          serviceName: s.serviceName,
          containerPort: s.containerPort,
          domain: s.domain ?? '',
          exposureMethod: (s.exposureMethod ?? 'dns') as ExposureMethod,
        })) ?? []
      )
    }
  }, [app.services, editingIndex])

  const getServiceStatus = (serviceName: string): string => {
    if (status?.containers) {
      const container = status.containers.find((c) => c.service === serviceName)
      if (container) return container.status
    }
    return 'stopped'
  }

  const handleSave = async () => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: {
        services: services.map((s) => ({
          serviceName: s.serviceName,
          containerPort: s.containerPort ?? undefined,
          exposed: !!s.domain,
          domain: s.domain || undefined,
          exposureMethod: s.exposureMethod,
        })),
      },
    })
    setEditingIndex(null)
    toast.warning(tCommon('apps.deployToApply'), {
      description: tCommon('apps.deployToApplyDesc'),
      action: {
        label: tCommon('apps.deploy'),
        onClick: onDeploy,
      },
    })
  }

  const updateService = (index: number, updates: Partial<(typeof services)[0]>) => {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)))
  }

  const toggleEdit = (index: number) => {
    if (editingIndex === index) {
      handleSave()
    } else {
      setEditingIndex(index)
    }
  }

  const cancelEdit = () => {
    setServices(
      app.services?.map((s) => ({
        serviceName: s.serviceName,
        containerPort: s.containerPort,
        domain: s.domain ?? '',
        exposureMethod: (s.exposureMethod ?? 'dns') as ExposureMethod,
      })) ?? []
    )
    setEditingIndex(null)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('detailView.app.services')}</h4>

      {services.length > 0 ? (
        <div className="space-y-2">
          {services.map((service, index) => {
            const runtimeStatus = getServiceStatus(service.serviceName)
            const isRunning = runtimeStatus === 'running'
            const isEditing = editingIndex === index
            const hasPort = !!service.containerPort
            const hasDomain = !!service.domain

            return (
              <div key={service.serviceName} className="flex items-center gap-3 text-sm">
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`}
                  title={runtimeStatus}
                />
                <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                  <span className="font-medium">{service.serviceName}</span>
                  {service.containerPort && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      :{service.containerPort}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Input
                        value={service.domain}
                        onChange={(e) => updateService(index, { domain: e.target.value })}
                        placeholder="app.example.com"
                        className="h-7 text-xs flex-1 min-w-0"
                        autoFocus
                        disabled={!hasPort}
                      />
                      <select
                        value={service.exposureMethod}
                        onChange={(e) => updateService(index, { exposureMethod: e.target.value as ExposureMethod })}
                        className="h-7 w-20 rounded-md border bg-background px-2 text-xs shrink-0"
                        disabled={!hasPort}
                      >
                        <option value="dns">DNS</option>
                        <option value="tunnel" disabled={!tunnelsAvailable}>Tunnel</option>
                      </select>
                    </>
                  ) : hasDomain ? (
                    <>
                      <a
                        href={`https://${service.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        {service.domain}
                      </a>
                      <Badge
                        variant={service.exposureMethod === 'tunnel' ? 'default' : 'outline'}
                        className="text-xs px-1.5 py-0 shrink-0"
                      >
                        {service.exposureMethod === 'tunnel' ? 'Tunnel' : 'DNS'}
                      </Badge>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50 text-xs">
                      {hasPort ? tCommon('apps.domains.noDomain') : tCommon('apps.domains.portRequired')}
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleEdit(index)}
                      disabled={updateApp.isPending}
                    >
                      {updateApp.isPending ? (
                        <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                      ) : (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} className="text-green-500" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                      <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => toggleEdit(index)}
                    disabled={!hasPort}
                  >
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      size={14}
                      strokeWidth={2}
                      className={hasPort ? 'text-muted-foreground' : 'text-muted-foreground/30'}
                    />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{tCommon('apps.general.noServicesConfigured')}</p>
      )}
    </div>
  )
}

// Environment section
function EnvironmentSection({ app }: { app: NonNullable<ProjectWithDetails['app']> }) {
  const { t } = useTranslation('common')
  const updateApp = useUpdateApp()

  const envVarsToText = (envVars: Record<string, string> | null | undefined) => {
    return Object.entries(envVars ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  const [envText, setEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [savedEnvText, setSavedEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [envSaved, setEnvSaved] = useState(false)
  const [masked, setMasked] = useState(true)

  const hasUnsavedChanges = envText !== savedEnvText

  const maskedLines = useMemo(() => {
    return envText.split('\n').map((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) return { type: 'empty' as const, id: i }
      if (trimmed.startsWith('#')) return { type: 'comment' as const, text: line, id: i }
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const keyLen = trimmed.slice(0, eqIndex).length
        const valueLen = trimmed.slice(eqIndex + 1).length
        return { type: 'env' as const, keyLen, valueLen, id: i }
      }
      return { type: 'other' as const, text: line, id: i }
    })
  }, [envText])

  const handleSaveEnv = async () => {
    const env: Record<string, string> = {}
    envText.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (key) {
          env[key] = value
        }
      }
    })

    await updateApp.mutateAsync({
      id: app.id,
      updates: { environmentVariables: env },
    })
    setSavedEnvText(envText)
    setEnvSaved(true)
    setTimeout(() => setEnvSaved(false), 2000)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.environment.title')}</h4>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-500">({t('apps.environment.unsavedChanges')})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setMasked(!masked)}
            >
              <HugeiconsIcon icon={masked ? ViewOffIcon : EyeIcon} size={14} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>{masked ? t('apps.environment.showValues') : t('apps.environment.hideValues')}</TooltipContent>
          </Tooltip>
          {hasUnsavedChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEnvText(savedEnvText)
                setEnvSaved(false)
              }}
            >
              {t('apps.cancel')}
            </Button>
          )}
          <Button size="sm" onClick={handleSaveEnv} disabled={updateApp.isPending || !hasUnsavedChanges}>
            {updateApp.isPending ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                {t('status.saving')}
              </>
            ) : envSaved ? (
              <>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} className="text-green-500" />
                {t('status.saved')}
              </>
            ) : (
              t('apps.environment.save')
            )}
          </Button>
        </div>
      </div>

      {masked ? (
        <div
          className="font-mono text-sm min-h-[120px] rounded-md border bg-background px-3 py-2 cursor-pointer"
          onClick={() => setMasked(false)}
        >
          {maskedLines.length === 0 || (maskedLines.length === 1 && maskedLines[0].type === 'empty') ? (
            <span className="text-muted-foreground">{t('apps.environment.placeholder')}</span>
          ) : (
            maskedLines.map((line) => (
              <div key={line.id} className="leading-6">
                {line.type === 'empty' ? (
                  <span>&nbsp;</span>
                ) : line.type === 'comment' || line.type === 'other' ? (
                  <span className="text-muted-foreground">{line.text}</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--chart-1)' }}>{'•'.repeat(line.keyLen)}</span>
                    <span style={{ color: 'var(--chart-3)' }}>•</span>
                    <span style={{ color: 'var(--chart-2)' }}>{'•'.repeat(line.valueLen)}</span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <Textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={t('apps.environment.placeholder')}
          className="font-mono text-sm min-h-[120px]"
        />
      )}
    </div>
  )
}

// Compose file editor
function ComposeFileEditor({ app, repoPath }: { app: NonNullable<ProjectWithDetails['app']>; repoPath: string }) {
  const { t } = useTranslation('common')
  const { data, isLoading, error } = useComposeFile(repoPath, app.composeFile)
  const writeCompose = useWriteComposeFile()
  const syncServices = useSyncServices()

  const [content, setContent] = useState<string>('')
  const [savedContent, setSavedContent] = useState<string>('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data?.content !== undefined) {
      setContent(data.content)
      setSavedContent(data.content)
    }
  }, [data?.content])

  const hasUnsavedChanges = content !== savedContent

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent)
    setSaved(false)
  }, [])

  const handleSave = useCallback(() => {
    if (!repoPath || !app.composeFile) return

    writeCompose.mutate(
      { repoPath, composeFile: app.composeFile, content },
      {
        onSuccess: () => {
          setSavedContent(content)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          syncServices.mutate(app.id)
        },
      }
    )
  }, [repoPath, app.composeFile, app.id, content, writeCompose, syncServices])

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('apps.compose.title')}</h4>
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
          <span className="text-sm">{t('status.loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('apps.compose.title')}</h4>
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.compose.title')}</h4>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-500">({t('apps.compose.unsavedChanges')})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{app.composeFile}</span>
          {hasUnsavedChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setContent(savedContent)
                setSaved(false)
              }}
            >
              {t('apps.cancel')}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={writeCompose.isPending || !hasUnsavedChanges}>
            {writeCompose.isPending ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                {t('status.saving')}
              </>
            ) : saved ? (
              <>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} className="text-green-500" />
                {t('status.saved')}
              </>
            ) : (
              t('apps.compose.save')
            )}
          </Button>
        </div>
      </div>

      <div className="h-[400px] rounded-md border overflow-hidden">
        <MonacoEditor
          filePath={app.composeFile}
          content={content}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

// Streaming deployment modal
function StreamingDeploymentModal({
  appId,
  open,
  onOpenChange,
}: {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const cancelDeployment = useCancelDeployment()
  const deployStore = useDeploymentStore()

  const [logs, setLogs] = useState<string[]>(() => deployStore.logsSnapshot)
  const [stage, setStage] = useState(deployStore.typedStage)
  const [error, setError] = useState(deployStore.error)
  const [isDeploying, setIsDeploying] = useState(deployStore.isDeploying)

  useEffect(() => {
    setLogs(deployStore.logsSnapshot)
    setStage(deployStore.typedStage)
    setError(deployStore.error)
    setIsDeploying(deployStore.isDeploying)

    const disposeLogsReaction = reaction(
      () => deployStore.logCount,
      () => setLogs(deployStore.logsSnapshot)
    )

    const disposeStateReaction = reaction(
      () => ({
        stage: deployStore.typedStage,
        error: deployStore.error,
        isDeploying: deployStore.isDeploying,
      }),
      (state) => {
        setStage(state.stage)
        setError(state.error)
        setIsDeploying(state.isDeploying)
      }
    )

    return () => {
      disposeLogsReaction()
      disposeStateReaction()
    }
  }, [deployStore])

  const parsedLogs = parseLogs(logs.join('\n'))

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs.length])

  const copyLogs = async () => {
    await navigator.clipboard.writeText(logs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCancel = async () => {
    await cancelDeployment.mutateAsync(appId)
  }

  const getStageLabel = (stage: DeploymentStage | null): string => {
    switch (stage) {
      case 'pulling': return t('apps.streaming.pulling')
      case 'building': return t('apps.streaming.building')
      case 'starting': return t('apps.streaming.starting')
      case 'configuring': return t('apps.streaming.configuring')
      case 'done': return t('apps.streaming.done')
      case 'failed': return t('apps.streaming.failed')
      case 'cancelled': return t('apps.streaming.cancelled')
      default: return t('apps.streaming.preparing')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] w-[90vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('apps.deployments.deployment')}
            {isDeploying && <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />}
            {!isDeploying && !error && stage === 'done' && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} className="text-green-500" />}
            {error && <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} className="text-destructive" />}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {getStageLabel(stage)}
            {isDeploying && (
              <>
                <span className="text-muted-foreground">|</span>
                <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelDeployment.isPending}>
                  {cancelDeployment.isPending ? (
                    <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                  )}
                  {cancelDeployment.isPending ? t('apps.cancelling') : t('apps.cancelDeploy')}
                </Button>
              </>
            )}
            <span className="text-muted-foreground">|</span>
            <span>{parsedLogs.length} {t('apps.logs.lines')}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyLogs} disabled={logs.length === 0}>
              <HugeiconsIcon
                icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
                size={14}
                strokeWidth={2}
                className={copied ? 'text-green-500' : ''}
              />
            </Button>
          </DialogDescription>
        </DialogHeader>
        <div ref={logsContainerRef} className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-2 custom-logs-scrollbar">
          {parsedLogs.length > 0 ? (
            parsedLogs.map((log, i) => <LogLine key={i} message={log.message} type={log.type} />)
          ) : isDeploying ? (
            <span className="text-muted-foreground p-2">{t('apps.streaming.waitingForLogs')}</span>
          ) : (
            <span className="text-muted-foreground p-2">{t('apps.deployments.noBuildLogs')}</span>
          )}
          {error && (
            <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
              {t('status.error')}: {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Deployments tab
function DeploymentsTab({
  appId,
  deployStore,
  onViewStreamingLogs,
}: {
  appId: string
  deployStore: ReturnType<typeof useDeploymentStore>
  onViewStreamingLogs: () => void
}) {
  const { t } = useTranslation('common')
  const { data: deployments, isLoading } = useDeployments(appId)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const handleViewLogs = (deployment: Deployment) => {
    if (deployment.status === 'building' || deployment.status === 'pending') {
      if (!deployStore.isDeploying || deployStore.appId !== appId) {
        deployStore.watchDeployment(appId)
      }
      onViewStreamingLogs()
    } else {
      setSelectedDeployment(deployment)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t('apps.deployments.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('apps.deployments.description')}</p>
      </div>

      {!deployments?.length ? (
        <div className="py-8 text-center text-muted-foreground border rounded-lg">
          <p>{t('apps.deployments.noDeployments')}</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {deployments.map((deployment, index) => (
            <DeploymentRow
              key={deployment.id}
              deployment={deployment}
              number={index + 1}
              onViewLogs={() => handleViewLogs(deployment)}
            />
          ))}
        </div>
      )}

      <DeploymentLogsModal
        deployment={selectedDeployment}
        open={!!selectedDeployment}
        onOpenChange={(open) => !open && setSelectedDeployment(null)}
      />
    </div>
  )
}

function DeploymentRow({
  deployment,
  number,
  onViewLogs,
}: {
  deployment: Deployment
  number: number
  onViewLogs: () => void
}) {
  const { t } = useTranslation('common')
  const isInProgress = deployment.status === 'building' || deployment.status === 'pending'

  const [, setTick] = useState(0)
  useEffect(() => {
    if (!isInProgress) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isInProgress])

  const getStatusInfo = () => {
    switch (deployment.status) {
      case 'running': return { text: t('apps.deployments.statusDone'), color: 'bg-green-500' }
      case 'failed': return { text: t('apps.deployments.statusError'), color: 'bg-red-500' }
      case 'building':
      case 'pending': return { text: t('apps.deployments.statusBuilding'), color: 'bg-yellow-500' }
      default: return { text: deployment.status, color: 'bg-gray-400' }
    }
  }

  const { text: statusText, color: statusColor } = getStatusInfo()

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground w-6">{number}.</span>
        <span className="font-medium">{statusText}</span>
        <div className={`h-2 w-2 rounded-full ${statusColor}`} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{formatRelativeTime(deployment.startedAt)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDuration(deployment.startedAt, deployment.completedAt)}
        </span>
        <Button size="sm" onClick={onViewLogs}>{t('apps.deployments.view')}</Button>
      </div>
    </div>
  )
}

function DeploymentLogsModal({
  deployment,
  open,
  onOpenChange,
}: {
  deployment: Deployment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)
  const logs = useMemo(() => parseLogs(deployment?.buildLogs ?? ''), [deployment?.buildLogs])

  const copyLogs = async () => {
    if (deployment?.buildLogs) {
      await navigator.clipboard.writeText(deployment.buildLogs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] w-[90vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('apps.deployments.deployment')}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {t('apps.deployments.seeDetails')}
            <span className="text-muted-foreground">|</span>
            <span>{logs.length} {t('apps.logs.lines')}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyLogs}>
              <HugeiconsIcon
                icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
                size={14}
                strokeWidth={2}
                className={copied ? 'text-green-500' : ''}
              />
            </Button>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-2 custom-logs-scrollbar">
          {logs.length > 0 ? (
            logs.map((log, i) => <LogLine key={i} message={log.message} type={log.type} />)
          ) : (
            <span className="text-muted-foreground p-2">{t('apps.deployments.noBuildLogs')}</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Logs tab
function LogsTab({
  appId,
  services,
}: {
  appId: string
  services?: NonNullable<ProjectWithDetails['app']>['services']
}) {
  const { t } = useTranslation('common')
  const { data: status } = useAppStatus(appId)
  const [selectedService, setSelectedService] = useState<string | undefined>()
  const [tail, setTail] = useState(100)
  const { data, isLoading, refetch } = useAppLogs(appId, selectedService, tail)
  const [copied, setCopied] = useState(false)
  const logs = useMemo(() => parseLogs(data?.logs ?? ''), [data?.logs])

  const copyLogs = async () => {
    if (data?.logs) {
      await navigator.clipboard.writeText(data.logs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadLogs = () => {
    if (data?.logs) {
      const blob = new Blob([data.logs], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${appId}-${selectedService ?? 'all'}-logs.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const containers = status?.containers ?? []

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h3 className="text-lg font-semibold">{t('apps.logs.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('apps.logs.description')}</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedService ?? ''}
          onChange={(e) => setSelectedService(e.target.value || undefined)}
          className="rounded-md border bg-background px-3 py-2 text-sm min-w-[240px]"
        >
          <option value="">{t('apps.logs.allContainers')}</option>
          {containers.length > 0
            ? containers.map((c) => (
                <option key={c.name} value={c.service}>
                  {c.service} ({c.name.slice(-12)}) [{c.status}]
                </option>
              ))
            : services?.map((s) => (
                <option key={s.id} value={s.serviceName}>
                  {s.serviceName}
                </option>
              ))}
        </select>

        <select
          value={tail}
          onChange={(e) => setTail(parseInt(e.target.value, 10))}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value={50}>50 {t('apps.logs.lines')}</option>
          <option value={100}>100 {t('apps.logs.lines')}</option>
          <option value={500}>500 {t('apps.logs.lines')}</option>
          <option value={1000}>1000 {t('apps.logs.lines')}</option>
        </select>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={!data?.logs}>
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
              size={14}
              strokeWidth={2}
              className={copied ? 'text-green-500' : ''}
            />
            {copied ? t('apps.logs.copied') : t('apps.logs.copy')}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadLogs} disabled={!data?.logs}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} className="rotate-[-90deg]" />
            {t('apps.logs.download')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
            {t('apps.logs.refresh')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-2 overflow-auto max-h-[600px] min-h-[300px] custom-logs-scrollbar">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-2">
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
            {t('status.loading')}
          </div>
        ) : logs.length > 0 ? (
          logs.map((log, i) => <LogLine key={i} message={log.message} type={log.type} />)
        ) : (
          <span className="text-muted-foreground p-2">{t('apps.logs.noLogs')}</span>
        )}
      </div>
    </div>
  )
}

// Monitoring tab
const DISTRIBUTION_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function extractServiceName(containerName: string): string {
  const underscoreParts = containerName.split('_')
  if (underscoreParts.length >= 2) {
    const servicePart = underscoreParts[1]
    const dotParts = servicePart.split('.')
    return dotParts[0]
  }
  const parts = containerName.split(/[-_.]/)
  for (const part of parts.slice(1)) {
    if (part && !part.match(/^\d+$/) && part.length > 2) {
      return part
    }
  }
  return containerName
}

function getProjectName(appId: string, repoName?: string): string {
  const suffix = appId.slice(0, 8).toLowerCase()
  if (repoName) {
    const sanitized = repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
      .replace(/-$/, '')
    return `vibora-${sanitized}-${suffix}`
  }
  return `vibora-${suffix}`
}

function DistributionRing({
  data,
  label,
  totalValue,
  unit,
}: {
  data: Array<{ name: string; value: number; color: string }>
  label: string
  totalValue: string
  unit: string
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={48}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload
                  return (
                    <div className="bg-popover border rounded-md px-2 py-1 text-xs shadow-md">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground">
                        {item.value.toFixed(1)} {unit}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold tabular-nums">{totalValue}</span>
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  )
}

function ServiceSummaryCard({ containers }: { containers: ContainerStats[] }) {
  const { t } = useTranslation('common')

  const totalCpu = containers.reduce((sum, c) => sum + c.cpuPercent, 0)
  const totalMemory = containers.reduce((sum, c) => sum + c.memoryMB, 0)

  const containerData = containers.map((c, i) => ({
    name: extractServiceName(c.name),
    cpu: c.cpuPercent,
    memory: c.memoryMB,
    color: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
  }))

  const cpuData = containerData.map((c) => ({ name: c.name, value: c.cpu, color: c.color }))
  const memoryData = containerData.map((c) => ({ name: c.name, value: c.memory, color: c.color }))

  return (
    <Card className="p-4 mb-6">
      <h4 className="text-sm font-medium mb-4">{t('apps.monitoring.serviceTotal')}</h4>

      <div className="flex items-center justify-center gap-8">
        <DistributionRing data={cpuData} label={t('apps.monitoring.cpu')} totalValue={totalCpu.toFixed(1)} unit="%" />
        <DistributionRing data={memoryData} label={t('apps.monitoring.memory')} totalValue={totalMemory.toFixed(0)} unit="MB" />
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
        {containerData.map((c) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="text-xs text-muted-foreground">{c.name}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function MonitoringTab({ appId, repoDisplayName }: { appId: string; repoDisplayName?: string }) {
  const { t } = useTranslation('common')
  const { data: dockerStats, isLoading } = useDockerStats()

  const appContainers = useMemo(() => {
    if (!dockerStats?.containers) return []
    const stackPrefix = `${getProjectName(appId, repoDisplayName)}_`
    return dockerStats.containers.filter((container) => {
      return container.name.toLowerCase().startsWith(stackPrefix)
    })
  }, [dockerStats, appId, repoDisplayName])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!dockerStats?.available) {
    return (
      <div className="max-w-2xl">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{t('apps.monitoring.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('apps.monitoring.description')}</p>
        </div>
        <div className="py-8 text-center text-muted-foreground border rounded-lg">
          <p>{t('apps.monitoring.dockerUnavailable')}</p>
        </div>
      </div>
    )
  }

  if (appContainers.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">{t('apps.monitoring.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('apps.monitoring.description')}</p>
        </div>
        <div className="py-8 text-center text-muted-foreground border rounded-lg">
          <p>{t('apps.monitoring.noContainers')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{t('apps.monitoring.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('apps.monitoring.description')}
          {dockerStats.runtime && <span className="ml-1 text-xs">({dockerStats.runtime})</span>}
        </p>
      </div>
      <ServiceSummaryCard containers={appContainers} />
    </div>
  )
}
