import { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  useApp,
  useDeployAppStream,
  useStopApp,
  useCancelDeployment,
  useAppLogs,
  useDeployments,
  useAppStatus,
  useUpdateApp,
  useDeleteApp,
  useComposeFile,
  useWriteComposeFile,
  useDeploymentPrerequisites,
  type DeploymentStage,
} from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  PlayIcon,
  StopIcon,
  RefreshIcon,
  Link01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Copy01Icon,
  Edit02Icon,
  ArrowLeft01Icon,
} from '@hugeicons/core-free-icons'
import { MonacoEditor } from '@/components/viewer/monaco-editor'
import type { Deployment } from '@/types'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'
import { toast } from 'sonner'

type AppTab = 'general' | 'deployments' | 'logs' | 'environment' | 'domains'

interface AppDetailSearch {
  tab?: AppTab
}

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailView,
  validateSearch: (search: Record<string, unknown>): AppDetailSearch => ({
    tab: ['general', 'deployments', 'logs', 'environment', 'domains'].includes(search.tab as string)
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

function AppDetailView() {
  const { t } = useTranslation('common')
  const { appId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { data: app, isLoading, error } = useApp(appId)
  const { data: prereqs } = useDeploymentPrerequisites()
  const deleteApp = useDeleteApp()
  const activeTab = tab || 'general'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Deployment state - lifted up so multiple tabs can trigger deploys
  const deployStream = useDeployAppStream()
  const [showStreamingLogs, setShowStreamingLogs] = useState(false)

  const handleDeploy = useCallback(() => {
    if (app) {
      deployStream.deploy(app.id)
      setShowStreamingLogs(true)
    }
  }, [app, deployStream])

  const handleStreamingLogsClose = useCallback((open: boolean) => {
    setShowStreamingLogs(open)
    if (!open) {
      setTimeout(() => deployStream.reset(), 300)
    }
  }, [deployStream])

  // Show DNS warning if app has exposed services but Cloudflare is not configured
  const hasExposedServices = app?.services?.some((s) => s.exposed && s.domain)
  const showDnsWarning = hasExposedServices && prereqs && !prereqs.settings.cloudflareConfigured

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
          {/* Tabs on left */}
          <TabsList variant="line">
            <TabsTrigger value="general" className="px-3 py-1.5">{t('apps.tabs.general')}</TabsTrigger>
            <TabsTrigger value="deployments" className="px-3 py-1.5">{t('apps.tabs.deployments')}</TabsTrigger>
            <TabsTrigger value="logs" className="px-3 py-1.5">{t('apps.tabs.logs')}</TabsTrigger>
            <TabsTrigger value="environment" className="px-3 py-1.5">{t('apps.tabs.environment')}</TabsTrigger>
            <TabsTrigger value="domains" className="px-3 py-1.5">{t('apps.tabs.domains')}</TabsTrigger>
          </TabsList>

          {/* App info on right */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{app.name}</span>
            <div
              className={`h-2 w-2 rounded-full ${
                app.status === 'running' ? 'bg-green-500' :
                app.status === 'building' ? 'bg-yellow-500' :
                app.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
              }`}
              title={t(`apps.status.${app.status}`)}
            />
            {showDnsWarning && (
              <button
                onClick={() => {
                  toast.warning(t('apps.manualDnsRequired'), {
                    description: t('apps.manualDnsRequiredDesc'),
                    action: {
                      label: t('apps.settings'),
                      onClick: () => navigate({ to: '/settings' }),
                    },
                  })
                }}
                className="p-1 text-amber-500 hover:text-amber-400 transition-colors"
                title={t('apps.dnsConfigRequired')}
              >
                <HugeiconsIcon icon={Alert02Icon} size={14} strokeWidth={2} />
              </button>
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
              deployStream={deployStream}
            />
          </TabsContent>

          <TabsContent value="deployments" className="mt-0">
            <DeploymentsTab appId={appId} />
          </TabsContent>

          <TabsContent value="logs" className="mt-0">
            <LogsTab appId={appId} services={app.services} />
          </TabsContent>

          <TabsContent value="environment" className="mt-0">
            <EnvironmentTab app={app} />
          </TabsContent>

          <TabsContent value="domains" className="mt-0">
            <DomainsTab app={app} onDeploy={handleDeploy} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Streaming deployment logs modal - at parent level so it works from any tab */}
      <StreamingDeploymentModal
        appId={appId}
        open={showStreamingLogs}
        onOpenChange={handleStreamingLogsClose}
        logs={deployStream.logs}
        stage={deployStream.stage}
        error={deployStream.error}
        isDeploying={deployStream.isDeploying}
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
}

// General tab - dense 2-column layout
function GeneralTab({
  app,
  onDeploy,
  deployStream,
}: {
  app: NonNullable<ReturnType<typeof useApp>['data']>
  onDeploy: () => void
  deployStream: ReturnType<typeof useDeployAppStream>
}) {
  const { t } = useTranslation('common')
  const { data: status } = useAppStatus(app.id)
  const stopApp = useStopApp()
  const cancelDeployment = useCancelDeployment()
  const updateApp = useUpdateApp()

  const handleStop = async () => {
    await stopApp.mutateAsync(app.id)
  }

  const handleCancelDeploy = async () => {
    await cancelDeployment.mutateAsync(app.id)
  }

  const isBuilding = deployStream.isDeploying || app.status === 'building'

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

  // Get services to display
  const serviceItems = status?.containers && status.containers.length > 0
    ? status.containers.map((container) => {
        const service = app.services?.find((s) => s.serviceName === container.service)
        return {
          name: container.service,
          status: container.status,
          domain: service?.exposed && service.domain ? service.domain : null,
        }
      })
    : app.services?.map((service) => ({
        name: service.serviceName,
        status: 'stopped',
        domain: service.exposed && service.domain ? service.domain : null,
      })) ?? []

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
              {deployStream.isDeploying ? t('apps.deploying') : app.status === 'building' ? t('apps.building') : t('apps.deploy')}
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
              <>
                <Button variant="outline" size="sm" onClick={onDeploy} disabled={isBuilding}>
                  <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
                  {t('apps.general.reload')}
                </Button>
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
              </>
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
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('apps.general.services')}</h4>
          {serviceItems.length > 0 ? (
            <div className="space-y-2">
              {serviceItems.map((service) => (
                <div key={service.name} className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      service.status === 'running' ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="font-medium">{service.name}</span>
                  <span className="text-muted-foreground">{service.status}</span>
                  {service.domain && (
                    <a
                      href={`https://${service.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-primary hover:underline"
                    >
                      <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} />
                      {service.domain}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('apps.general.noServicesConfigured')}</p>
          )}
        </div>
      </div>

      {/* Bottom row: Compose file full width */}
      <ComposeFileEditor app={app} />
    </div>
  )
}

// Streaming deployment logs modal - shows real-time logs during deployment
function StreamingDeploymentModal({
  appId,
  open,
  onOpenChange,
  logs,
  stage,
  error,
  isDeploying,
}: {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  logs: string[]
  stage: DeploymentStage | null
  error: string | null
  isDeploying: boolean
}) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const cancelDeployment = useCancelDeployment()

  // Parse logs for display
  const parsedLogs = useMemo(() => parseLogs(logs.join('\n')), [logs])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs])

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
              },
            }
          )
        }, 1000)
      }
    },
    [isEditing, repoPath, app.composeFile, writeCompose]
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
function DeploymentsTab({ appId }: { appId: string }) {
  const { t } = useTranslation('common')
  const { data: deployments, isLoading } = useDeployments(appId)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

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
              onViewLogs={() => setSelectedDeployment(deployment)}
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
        <span className="text-sm text-muted-foreground">
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

// Environment tab - environment variables
function EnvironmentTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const { t } = useTranslation('common')
  const updateApp = useUpdateApp()

  // Environment variables state - convert object to "KEY=value" lines
  const [envText, setEnvText] = useState(() => {
    const envVars = app.environmentVariables ?? {}
    return Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  })
  const [envSaved, setEnvSaved] = useState(false)

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
    setEnvSaved(true)
    setTimeout(() => setEnvSaved(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold">{t('apps.environment.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('apps.environment.description')}
        </p>
      </div>

      <Textarea
        value={envText}
        onChange={(e) => setEnvText(e.target.value)}
        placeholder={t('apps.environment.placeholder')}
        className="font-mono text-sm min-h-[200px]"
      />

      <div className="flex justify-end">
        <Button onClick={handleSaveEnv} disabled={updateApp.isPending}>
          {updateApp.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
              {t('status.saving')}
            </>
          ) : envSaved ? (
            <>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} className="text-green-500" />
              {t('status.saved')}
            </>
          ) : (
            t('apps.environment.save')
          )}
        </Button>
      </div>

      {updateApp.error && (
        <div className="flex items-center gap-2 text-destructive mt-4">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{updateApp.error.message}</span>
        </div>
      )}
    </div>
  )
}

// Domains tab - service exposure and domain configuration
function DomainsTab({
  app,
  onDeploy,
}: {
  app: NonNullable<ReturnType<typeof useApp>['data']>
  onDeploy: () => void
}) {
  const { t } = useTranslation('common')
  const updateApp = useUpdateApp()

  // Services/domains state
  const [services, setServices] = useState(
    app.services?.map((s) => ({
      serviceName: s.serviceName,
      containerPort: s.containerPort,
      exposed: s.exposed,
      domain: s.domain ?? '',
    })) ?? []
  )

  const handleSaveDomains = async () => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: {
        services: services.map((s) => ({
          serviceName: s.serviceName,
          containerPort: s.containerPort ?? undefined,
          exposed: s.exposed,
          domain: s.domain || undefined,
        })),
      },
    })
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

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold">{t('apps.domains.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('apps.domains.description')}
        </p>
      </div>

      {/* Services */}
      {services.length > 0 ? (
        <div className="space-y-4">
          {services.map((service, index) => (
            <div key={service.serviceName} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{service.serviceName}</span>
                  {service.containerPort && <Badge variant="secondary">:{service.containerPort}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`expose-${index}`}
                    checked={service.exposed}
                    onCheckedChange={(checked) => updateService(index, { exposed: checked === true })}
                  />
                  <Label htmlFor={`expose-${index}`} className="text-sm">
                    {t('apps.domains.expose')}
                  </Label>
                </div>
              </div>

              {service.exposed && (
                <div className="space-y-2">
                  <Label htmlFor={`domain-${index}`} className="text-sm">
                    {t('apps.domains.domain')}
                  </Label>
                  <Input
                    id={`domain-${index}`}
                    value={service.domain}
                    onChange={(e) => updateService(index, { domain: e.target.value })}
                    placeholder="app.example.com"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground border rounded-lg">
          <p>{t('apps.domains.noServices')}</p>
        </div>
      )}

      {/* Save button */}
      {services.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSaveDomains} disabled={updateApp.isPending}>
            {updateApp.isPending ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
                {t('status.saving')}
              </>
            ) : (
              t('apps.domains.save')
            )}
          </Button>
        </div>
      )}

      {updateApp.error && (
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{updateApp.error.message}</span>
        </div>
      )}
    </div>
  )
}
