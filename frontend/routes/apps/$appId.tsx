import { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'
import { reaction } from 'mobx'
import {
  useApp,
  useStopApp,
  useCancelDeployment,
  useAppLogs,
  useDeployments,
  useAppStatus,
  useUpdateApp,
  useDeleteApp,
  useComposeFile,
  useWriteComposeFile,
  useSyncServices,
  useDeploymentPrerequisites,
  useDeploymentSettings,
} from '@/hooks/use-apps'
import { useDeploymentStore, DeploymentStoreProvider, type DeploymentStage } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Edit02Icon,
  PencilEdit02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Menu01Icon,
  PackageIcon,
  ViewOffIcon,
  EyeIcon,
} from '@hugeicons/core-free-icons'
import { MonacoEditor } from '@/components/viewer/monaco-editor'
import type { Deployment, ExposureMethod } from '@/types'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'
import { toast } from 'sonner'
import { useDockerStats, type ContainerStats } from '@/hooks/use-monitoring'
import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'

type AppTab = 'general' | 'deployments' | 'logs' | 'monitoring'

interface AppDetailSearch {
  tab?: AppTab
}

// Wrap AppDetailView with DeploymentStoreProvider so all child components can access deployment state
function AppDetailViewWithProvider() {
  return (
    <DeploymentStoreProvider>
      <AppDetailView />
    </DeploymentStoreProvider>
  )
}

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailViewWithProvider,
  validateSearch: (search: Record<string, unknown>): AppDetailSearch => ({
    tab: ['general', 'deployments', 'logs', 'monitoring'].includes(search.tab as string)
      ? (search.tab as AppTab)
      : undefined,
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

const AppDetailView = observer(function AppDetailView() {
  const { t } = useTranslation('common')
  const { appId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { data: app, isLoading, error } = useApp(appId)
  const { data: prereqs } = useDeploymentPrerequisites()
  const deleteApp = useDeleteApp()
  const activeTab = tab || 'general'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Deployment state from MST store - provides predictable state and logging
  const deployStore = useDeploymentStore()
  const [showStreamingLogs, setShowStreamingLogs] = useState(false)

  const handleDeploy = useCallback(() => {
    if (app) {
      deployStore.deploy(app.id)
      setShowStreamingLogs(true)
    }
  }, [app, deployStore])

  const handleStreamingLogsClose = useCallback((open: boolean) => {
    setShowStreamingLogs(open)
    // Only reset logs after modal closes if deployment is complete AND no logs to show
    // This preserves logs when modal is closed and reopened during/after deployment
    if (!open && !deployStore.isDeploying && deployStore.logs.length === 0 && !deployStore.error) {
      setTimeout(() => deployStore.reset(), 300)
    }
  }, [deployStore])

  // Show DNS warning if Cloudflare is not configured
  const showDnsWarning = prereqs && !prereqs.settings.cloudflareConfigured

  const setActiveTab = useCallback(
    (newTab: AppTab) => {
      navigate({
        to: '/apps/$appId',
        params: { appId },
        search: newTab === 'general' ? {} : { tab: newTab },
        replace: true,
      })
    },
    [navigate, appId]
  )

  const handleDelete = async () => {
    await deleteApp.mutateAsync({ id: appId })
    navigate({ to: '/apps' })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !app) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={48} strokeWidth={1.5} className="text-destructive" />
        <p className="text-muted-foreground">{error?.message ?? 'App not found'}</p>
        <Link to="/apps">
          <Button variant="outline">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
            {t('apps.backToApps')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AppTab)} className="flex h-full flex-col">
        {/* Header bar - tabs on left, app info on right */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 py-2">
          {/* Mobile: hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 sm:hidden">
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={2} />
              <span className="text-sm font-medium">{t(`apps.tabs.${activeTab}`)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setActiveTab('general')}>
                {t('apps.tabs.general')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('deployments')}>
                {t('apps.tabs.deployments')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('logs')}>
                {t('apps.tabs.logs')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('monitoring')}>
                {t('apps.tabs.monitoring')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop: tabs */}
          <TabsList variant="line" className="hidden sm:inline-flex">
            <TabsTrigger value="general" className="px-3 py-1.5">{t('apps.tabs.general')}</TabsTrigger>
            <TabsTrigger value="deployments" className="px-3 py-1.5">{t('apps.tabs.deployments')}</TabsTrigger>
            <TabsTrigger value="logs" className="px-3 py-1.5">{t('apps.tabs.logs')}</TabsTrigger>
            <TabsTrigger value="monitoring" className="px-3 py-1.5">{t('apps.tabs.monitoring')}</TabsTrigger>
          </TabsList>

          {/* App info on right */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{app.name}</span>
            {app.repository && (
              <Link
                to="/repositories/$repoId"
                params={{ repoId: app.repository.id }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={app.repository.displayName}
              >
                <HugeiconsIcon icon={PackageIcon} size={14} strokeWidth={2} />
              </Link>
            )}
            <div
              className={`h-2 w-2 rounded-full ${
                app.status === 'running' ? 'bg-green-500' :
                app.status === 'building' ? 'bg-yellow-500' :
                app.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
              }`}
              title={t(`apps.status.${app.status}`)}
            />
            {showDnsWarning && (
              <Tooltip>
                <TooltipTrigger className="p-1 text-amber-500 hover:text-amber-400 transition-colors">
                  <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">{t('apps.manualDnsRequired')}</p>
                  <p className="text-muted-foreground mt-1">{t('apps.manualDnsRequiredDesc')}</p>
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
        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="general" className="mt-0">
            <GeneralTab
              app={app}
              onDeploy={handleDeploy}
            />
          </TabsContent>

          <TabsContent value="deployments" className="mt-0">
            <DeploymentsTab appId={appId} onViewStreamingLogs={() => setShowStreamingLogs(true)} />
          </TabsContent>

          <TabsContent value="logs" className="mt-0">
            <LogsTab appId={appId} services={app.services} />
          </TabsContent>

          <TabsContent value="monitoring" className="mt-0">
            <MonitoringTab appId={app.id} repoDisplayName={app.repository?.displayName} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Streaming deployment logs modal - at parent level so it works from any tab */}
      <StreamingDeploymentModal
        appId={appId}
        open={showStreamingLogs}
        onOpenChange={handleStreamingLogsClose}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apps.deleteApp')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('apps.deleteAppConfirm', { name: app.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('apps.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteApp.isPending ? t('apps.deleting') : t('apps.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})

// General tab - dense 2-column layout
const GeneralTab = observer(function GeneralTab({
  app,
  onDeploy,
}: {
  app: NonNullable<ReturnType<typeof useApp>['data']>
  onDeploy: () => void
}) {
  const { t } = useTranslation('common')
  const stopApp = useStopApp()
  const cancelDeployment = useCancelDeployment()
  const updateApp = useUpdateApp()
  const deployStore = useDeploymentStore()

  const handleStop = async () => {
    await stopApp.mutateAsync(app.id)
  }

  const handleCancelDeploy = async () => {
    await cancelDeployment.mutateAsync(app.id)
  }

  const isBuilding = deployStore.isDeploying || app.status === 'building'

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
    <div className="space-y-4">
      {/* Top row: Deploy + Services side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deploy section */}
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.general.deploy')}</h4>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onDeploy} disabled={isBuilding}>
              {isBuilding ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
              )}
              {deployStore.isDeploying ? t('apps.deploying') : app.status === 'building' ? t('apps.building') : t('apps.deploy')}
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
                {cancelDeployment.isPending ? t('apps.cancelling') : t('apps.cancelDeploy')}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                disabled={stopApp.isPending || app.status !== 'running'}
              >
                {stopApp.isPending ? (
                  <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                ) : (
                  <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                )}
                {t('apps.stop')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={app.autoDeployEnabled ?? false}
                onCheckedChange={(checked) => handleAutoDeployToggle(checked === true)}
              />
              <span>{t('apps.general.autodeploy')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={app.noCacheBuild ?? false}
                onCheckedChange={(checked) => handleNoCacheToggle(checked === true)}
              />
              <span>{t('apps.general.noCache')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={app.notificationsEnabled ?? true}
                onCheckedChange={(checked) => handleNotificationsToggle(checked === true)}
              />
              <span>{t('apps.general.notifications')}</span>
            </label>
          </div>
        </div>

        {/* Services section */}
        <ServicesSection app={app} onDeploy={onDeploy} />
      </div>

      {/* Environment section - full width */}
      <EnvironmentSection app={app} />

      {/* Bottom row: Compose file full width */}
      <ComposeFileEditor app={app} />
    </div>
  )
})

// Streaming deployment logs modal - shows real-time logs during deployment
// Uses reaction() instead of observer for logs to ensure updates work when modal is closed/reopened
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

  // Use React state for logs, synced from store via reaction
  // This ensures updates work regardless of Dialog mount/unmount behavior
  const [logs, setLogs] = useState<string[]>(() => deployStore.logsSnapshot)
  const [stage, setStage] = useState(deployStore.typedStage)
  const [error, setError] = useState(deployStore.error)
  const [isDeploying, setIsDeploying] = useState(deployStore.isDeploying)

  // Sync store state to React state using reaction
  // This runs whenever any tracked observable changes
  useEffect(() => {
    // Initial sync when modal opens
    setLogs(deployStore.logsSnapshot)
    setStage(deployStore.typedStage)
    setError(deployStore.error)
    setIsDeploying(deployStore.isDeploying)

    // Set up reaction to sync logs
    const disposeLogsReaction = reaction(
      () => deployStore.logCount,
      () => {
        console.log('[StreamingDeploymentModal] reaction: logs changed', deployStore.logCount)
        setLogs(deployStore.logsSnapshot)
      }
    )

    // Set up reaction to sync other state
    const disposeStateReaction = reaction(
      () => ({
        stage: deployStore.typedStage,
        error: deployStore.error,
        isDeploying: deployStore.isDeploying,
      }),
      (state) => {
        console.log('[StreamingDeploymentModal] reaction: state changed', state)
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

  // Debug: log renders
  console.log('[StreamingDeploymentModal] render', { logCount: logs.length, isDeploying, stage, open })

  // Parse logs for display
  const parsedLogs = parseLogs(logs.join('\n'))

  // Auto-scroll to bottom when new logs arrive
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
      case 'pulling':
        return t('apps.streaming.pulling')
      case 'building':
        return t('apps.streaming.building')
      case 'starting':
        return t('apps.streaming.starting')
      case 'configuring':
        return t('apps.streaming.configuring')
      case 'done':
        return t('apps.streaming.done')
      case 'failed':
        return t('apps.streaming.failed')
      case 'cancelled':
        return t('apps.streaming.cancelled')
      default:
        return t('apps.streaming.preparing')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] w-[90vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('apps.deployments.deployment')}
            {isDeploying && (
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
            )}
            {!isDeploying && !error && stage === 'done' && (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} className="text-green-500" />
            )}
            {error && (
              <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} className="text-destructive" />
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {getStageLabel(stage)}
            {isDeploying && (
              <>
                <span className="text-muted-foreground">|</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelDeployment.isPending}
                >
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
        <div
          ref={logsContainerRef}
          className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-2 custom-logs-scrollbar"
        >
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

// Compose file editor - embedded in General tab
function ComposeFileEditor({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const { t } = useTranslation('common')
  const repoPath = app.repository?.path ?? null
  const { data, isLoading, error } = useComposeFile(repoPath, app.composeFile)
  const writeCompose = useWriteComposeFile()
  const syncServices = useSyncServices()

  // Local content state for editing
  const [content, setContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sync content when data loads
  useEffect(() => {
    if (data?.content !== undefined) {
      setContent(data.content)
      setHasChanges(false)
    }
  }, [data?.content])

  // Debounced autosave
  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      setHasChanges(true)
      setSaved(false)

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Autosave after 1 second of inactivity
      if (isEditing && repoPath && app.composeFile) {
        saveTimeoutRef.current = setTimeout(() => {
          writeCompose.mutate(
            { repoPath, composeFile: app.composeFile, content: newContent },
            {
              onSuccess: () => {
                setHasChanges(false)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
                // Sync services to update ports from compose file
                syncServices.mutate(app.id)
              },
            }
          )
        }, 1000)
      }
    },
    [isEditing, repoPath, app.composeFile, app.id, writeCompose, syncServices]
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const toggleEdit = () => {
    if (isEditing && hasChanges && repoPath && app.composeFile) {
      // Save before exiting edit mode
      writeCompose.mutate(
        { repoPath, composeFile: app.composeFile, content },
        {
          onSuccess: () => {
            setHasChanges(false)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
            // Sync services to update ports from compose file
            syncServices.mutate(app.id)
          },
        }
      )
    }
    setIsEditing(!isEditing)
  }

  if (!repoPath) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{t('apps.compose.title')}</h4>
        <p className="text-sm text-muted-foreground">{t('apps.compose.repoNotFound')}</p>
      </div>
    )
  }

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.compose.title')}</h4>
        <div className="flex items-center gap-2">
          {/* Status indicators */}
          {hasChanges && isEditing && (
            <span className="text-xs text-muted-foreground">{t('apps.compose.unsaved')}</span>
          )}
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} />
              {t('status.saved')}
            </span>
          )}
          {writeCompose.isPending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Loading03Icon} size={12} strokeWidth={2} className="animate-spin" />
              {t('status.saving')}
            </span>
          )}
          <span className="text-sm text-muted-foreground">{app.composeFile}</span>
          {/* Edit toggle */}
          <Button
            variant={isEditing ? 'default' : 'outline'}
            size="sm"
            onClick={toggleEdit}
          >
            <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
            {isEditing ? t('apps.compose.done') : t('apps.compose.edit')}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-[400px] rounded-md border overflow-hidden">
        <MonacoEditor
          filePath={app.composeFile}
          content={content}
          onChange={handleChange}
          readOnly={!isEditing}
        />
      </div>
    </div>
  )
}

// Logs tab - Dokploy style with container selector
function LogsTab({
  appId,
  services,
}: {
  appId: string
  services?: NonNullable<ReturnType<typeof useApp>['data']>['services']
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

  // Get container info for dropdown
  const containers = status?.containers ?? []

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h3 className="text-lg font-semibold">{t('apps.logs.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('apps.logs.description')}
        </p>
      </div>

      {/* Container selector */}
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

// Deployments tab - Dokploy style clean list
function DeploymentsTab({
  appId,
  onViewStreamingLogs,
}: {
  appId: string
  onViewStreamingLogs: () => void
}) {
  const { t } = useTranslation('common')
  const { data: deployments, isLoading } = useDeployments(appId)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const handleViewLogs = (deployment: Deployment) => {
    // If deployment is in progress (building/pending), show streaming modal
    // Otherwise show the database logs modal
    if (deployment.status === 'building' || deployment.status === 'pending') {
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
        <p className="text-sm text-muted-foreground">
          {t('apps.deployments.description')}
        </p>
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

// Deployment row - clean single line with View button
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

  // Force re-render every second while deployment is in progress to update duration
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!isInProgress) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isInProgress])

  const getStatusInfo = () => {
    switch (deployment.status) {
      case 'running':
        return { text: t('apps.deployments.statusDone'), color: 'bg-green-500' }
      case 'failed':
        return { text: t('apps.deployments.statusError'), color: 'bg-red-500' }
      case 'building':
      case 'pending':
        return { text: t('apps.deployments.statusBuilding'), color: 'bg-yellow-500' }
      default:
        return { text: deployment.status, color: 'bg-gray-400' }
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
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(deployment.startedAt)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          ⏱ {formatDuration(deployment.startedAt, deployment.completedAt)}
        </span>
        <Button size="sm" onClick={onViewLogs}>
          {t('apps.deployments.view')}
        </Button>
      </div>
    </div>
  )
}

// Deployment logs modal - Dokploy style with log highlighting
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

// Environment section - environment variables (inline in General tab)
function EnvironmentSection({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const { t } = useTranslation('common')
  const updateApp = useUpdateApp()

  // Convert app env vars to text format
  const envVarsToText = (envVars: Record<string, string> | null | undefined) => {
    return Object.entries(envVars ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  // Environment variables state - convert object to "KEY=value" lines
  const [envText, setEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [savedEnvText, setSavedEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [envSaved, setEnvSaved] = useState(false)
  const [masked, setMasked] = useState(true)

  // Check if there are unsaved changes
  const hasUnsavedChanges = envText !== savedEnvText

  // Parse env vars for masked display with colored dots matching actual lengths
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
    // Parse "KEY=value" lines back to object
    const env: Record<string, string> = {}
    envText.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return // Skip empty lines and comments
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
          <Button size="sm" onClick={handleSaveEnv} disabled={updateApp.isPending}>
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

      {updateApp.error && (
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
          <span className="text-sm">{updateApp.error.message}</span>
        </div>
      )}
    </div>
  )
}

// Services section - unified status + domain configuration
function ServicesSection({
  app,
  onDeploy,
}: {
  app: NonNullable<ReturnType<typeof useApp>['data']>
  onDeploy: () => void
}) {
  const { t } = useTranslation('common')
  const { data: status } = useAppStatus(app.id)
  const { data: deploymentSettings } = useDeploymentSettings()
  const updateApp = useUpdateApp()
  const tunnelsAvailable = deploymentSettings?.tunnelsAvailable ?? false

  // Services state for editing
  const [services, setServices] = useState(
    app.services?.map((s) => ({
      serviceName: s.serviceName,
      containerPort: s.containerPort,
      domain: s.domain ?? '',
      exposureMethod: (s.exposureMethod ?? 'dns') as ExposureMethod,
    })) ?? []
  )

  // Track which service is being edited
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Sync services state when app data changes (e.g., after compose file sync)
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

  // Get runtime status for each service
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
          // Derive exposed from whether domain is set
          exposed: !!s.domain,
          domain: s.domain || undefined,
          exposureMethod: s.exposureMethod,
        })),
      },
    })
    setEditingIndex(null)
    toast.warning(t('apps.deployToApply'), {
      description: t('apps.deployToApplyDesc'),
      action: {
        label: t('apps.deploy'),
        onClick: onDeploy,
      },
    })
  }

  const updateService = (index: number, updates: Partial<(typeof services)[0]>) => {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)))
  }

  const toggleEdit = (index: number) => {
    if (editingIndex === index) {
      // Save when exiting edit mode
      handleSave()
    } else {
      setEditingIndex(index)
    }
  }

  const cancelEdit = () => {
    // Reset to original values
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
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.general.services')}</h4>
      </div>

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
                {/* Status dot */}
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`}
                  title={runtimeStatus}
                />

                {/* Service name + port */}
                <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                  <span className="font-medium">{service.serviceName}</span>
                  {service.containerPort && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      :{service.containerPort}
                    </Badge>
                  )}
                </div>

                {/* Domain - either link, input, or placeholder */}
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
                        <option value="tunnel" disabled={!tunnelsAvailable}>
                          Tunnel
                        </option>
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
                      {hasPort ? t('apps.domains.noDomain') : t('apps.domains.portRequired')}
                    </span>
                  )}
                </div>

                {/* Edit/Cancel button */}
                {isEditing ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleEdit(index)}
                      disabled={updateApp.isPending}
                      title={t('apps.domains.save')}
                    >
                      {updateApp.isPending ? (
                        <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                      ) : (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} className="text-green-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={cancelEdit}
                      title={t('apps.cancel')}
                    >
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
                    title={!hasPort ? t('apps.domains.exposeRequiresPort') : t('apps.domains.editDomain')}
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
        <p className="text-sm text-muted-foreground">{t('apps.general.noServicesConfigured')}</p>
      )}

      {updateApp.error && (
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
          <span className="text-sm">{updateApp.error.message}</span>
        </div>
      )}
    </div>
  )
}

// Helper to extract service name from container name
function extractServiceName(containerName: string): string {
  // Docker Swarm format: project_service.replica.taskid
  // Example: "vibora-bg-qczqd_pocketbase.1.abc123" -> "pocketbase"

  // First split by underscore to separate project from service
  const underscoreParts = containerName.split('_')
  if (underscoreParts.length >= 2) {
    // Take the second part, then remove replica/task suffix
    const servicePart = underscoreParts[1]
    // Remove .N.taskid suffix
    const dotParts = servicePart.split('.')
    return dotParts[0]
  }

  // Fallback: split by dash and find service name
  const parts = containerName.split(/[-_.]/)
  for (const part of parts.slice(1)) {
    if (part && !part.match(/^\d+$/) && part.length > 2) {
      return part
    }
  }
  return containerName
}

// Colors for distribution charts
const DISTRIBUTION_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// Distribution ring chart component
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

// Service summary card with total usage and distribution charts
function ServiceSummaryCard({ containers }: { containers: ContainerStats[] }) {
  const { t } = useTranslation('common')

  const totalCpu = containers.reduce((sum, c) => sum + c.cpuPercent, 0)
  const totalMemory = containers.reduce((sum, c) => sum + c.memoryMB, 0)

  // Prepare data for distribution charts
  const containerData = containers.map((c, i) => ({
    name: extractServiceName(c.name),
    cpu: c.cpuPercent,
    memory: c.memoryMB,
    color: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
  }))

  const cpuData = containerData.map((c) => ({
    name: c.name,
    value: c.cpu,
    color: c.color,
  }))

  const memoryData = containerData.map((c) => ({
    name: c.name,
    value: c.memory,
    color: c.color,
  }))

  return (
    <Card className="p-4 mb-6">
      <h4 className="text-sm font-medium mb-4">{t('apps.monitoring.serviceTotal')}</h4>

      <div className="flex items-center justify-center gap-8">
        <DistributionRing
          data={cpuData}
          label={t('apps.monitoring.cpu')}
          totalValue={totalCpu.toFixed(1)}
          unit="%"
        />
        <DistributionRing
          data={memoryData}
          label={t('apps.monitoring.memory')}
          totalValue={totalMemory.toFixed(0)}
          unit="MB"
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
        {containerData.map((c) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <span className="text-xs text-muted-foreground">{c.name}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// Helper to generate project name matching backend logic
function getProjectName(appId: string, repoName?: string): string {
  const suffix = appId.slice(0, 8).toLowerCase()
  if (repoName) {
    // Sanitize repo name for Docker: lowercase, alphanumeric + hyphens only, max 20 chars
    const sanitized = repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
      .replace(/-$/, '') // Remove trailing hyphen if truncation created one
    return `vibora-${sanitized}-${suffix}`
  }
  return `vibora-${suffix}`
}

// Monitoring tab - real-time resource usage for app containers
function MonitoringTab({ appId, repoDisplayName }: { appId: string; repoDisplayName?: string }) {
  const { t } = useTranslation('common')
  const { data: dockerStats, isLoading } = useDockerStats()

  // Filter containers that belong to this app
  // Docker Swarm container names follow the pattern: {stackName}_{serviceName}.{replica}.{taskId}
  const appContainers = useMemo(() => {
    if (!dockerStats?.containers) return []

    // Match the backend's getProjectName function
    const stackPrefix = `${getProjectName(appId, repoDisplayName)}_`

    return dockerStats.containers.filter((container) => {
      // Container name should start with our stack prefix
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
          {dockerStats.runtime && (
            <span className="ml-1 text-xs">({dockerStats.runtime})</span>
          )}
        </p>
      </div>

      {/* Service summary with distribution charts */}
      <ServiceSummaryCard containers={appContainers} />
    </div>
  )
}
