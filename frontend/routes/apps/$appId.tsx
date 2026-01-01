import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  useApp,
  useDeployApp,
  useStopApp,
  useAppLogs,
  useDeployments,
  useAppStatus,
  useUpdateApp,
  useDeleteApp,
  useComposeFile,
  useWriteComposeFile,
} from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
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
  PackageIcon,
  ArrowLeft01Icon,
} from '@hugeicons/core-free-icons'
import { MonacoEditor } from '@/components/viewer/monaco-editor'
import type { Deployment } from '@/types'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailView,
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

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
      return 'default'
    case 'building':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

function AppDetailView() {
  const { appId } = Route.useParams()
  const navigate = useNavigate()
  const { data: app, isLoading, error } = useApp(appId)
  const deleteApp = useDeleteApp()
  const [activeTab, setActiveTab] = useState('general')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
            Back to Apps
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header - Dokploy style */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-background px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{app.name}</span>
            <Badge variant={getStatusBadgeVariant(app.status)} className="capitalize">
              {app.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{app.id.slice(0, 12)}</span>
            {app.repository && (
              <>
                <span>·</span>
                <Link
                  to="/repositories/$repoId"
                  params={{ repoId: app.repository.id }}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <HugeiconsIcon icon={PackageIcon} size={12} strokeWidth={2} />
                  {app.repository.displayName}
                </Link>
              </>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="environment">Environment</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralTab app={app} />
          </TabsContent>

          <TabsContent value="deployments">
            <DeploymentsTab appId={appId} />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab appId={appId} services={app.services} />
          </TabsContent>

          <TabsContent value="environment">
            <EnvironmentTab app={app} />
          </TabsContent>

          <TabsContent value="domains">
            <DomainsTab app={app} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete App</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{app.name}"? This will stop all containers and remove the app
              configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteApp.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// General tab - Dokploy style with deploy actions
function GeneralTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const { data: status } = useAppStatus(app.id)
  const deployApp = useDeployApp()
  const stopApp = useStopApp()
  const updateApp = useUpdateApp()

  const handleDeploy = async () => {
    await deployApp.mutateAsync(app.id)
  }

  const handleStop = async () => {
    await stopApp.mutateAsync(app.id)
  }

  const handleAutoDeployToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { autoDeployEnabled: enabled },
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Deploy Settings Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Deploy Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure and deploy your compose application
          </p>
        </div>
        <Badge variant="secondary">Compose</Badge>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button onClick={handleDeploy} disabled={deployApp.isPending || app.status === 'building'}>
          {deployApp.isPending || app.status === 'building' ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
          )}
          {app.status === 'building' ? 'Building...' : 'Deploy'}
        </Button>
        <Button variant="outline" onClick={handleDeploy} disabled={deployApp.isPending}>
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
          Reload
        </Button>
        <Button
          variant="outline"
          onClick={handleStop}
          disabled={stopApp.isPending || app.status !== 'running'}
        >
          {stopApp.isPending ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
          )}
          Stop
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Checkbox
            id="autodeploy"
            checked={app.autoDeployEnabled ?? false}
            onCheckedChange={(checked) => handleAutoDeployToggle(checked === true)}
          />
          <Label htmlFor="autodeploy" className="text-sm">
            Autodeploy
          </Label>
        </div>
      </div>

      <Separator />

      {/* Services Status */}
      <div>
        <h4 className="font-medium mb-3">Services</h4>
        <div className="space-y-2 rounded-lg border p-3">
          {status?.containers && status.containers.length > 0 ? (
            status.containers.map((container) => {
              const service = app.services?.find((s) => s.serviceName === container.service)
              return (
                <div key={container.name} className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      container.status === 'running' ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="font-medium text-sm">{container.service}</span>
                  <span className="text-sm text-muted-foreground">{container.status}</span>
                  {service?.exposed && service.domain && (
                    <a
                      href={`https://${service.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} />
                      {service.domain}
                    </a>
                  )}
                </div>
              )
            })
          ) : app.services && app.services.length > 0 ? (
            app.services.map((service) => (
              <div key={service.id} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-gray-400" />
                <span className="font-medium text-sm">{service.serviceName}</span>
                <span className="text-sm text-muted-foreground">stopped</span>
                {service.exposed && service.domain && (
                  <a
                    href={`https://${service.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} />
                    {service.domain}
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No services configured</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Compose File */}
      <ComposeFileEditor app={app} />

      <Separator />

      {/* Build Settings */}
      <BuildSettings app={app} />
    </div>
  )
}

// Build settings component
function BuildSettings({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const updateApp = useUpdateApp()
  const [noCacheBuild, setNoCacheBuild] = useState(app.noCacheBuild ?? false)

  const handleToggleNoCache = async (checked: boolean) => {
    setNoCacheBuild(checked)
    await updateApp.mutateAsync({
      id: app.id,
      updates: { noCacheBuild: checked },
    })
  }

  return (
    <div>
      <h4 className="font-medium mb-3">Build Settings</h4>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="no-cache-build" className="text-sm font-medium">
            No Cache Build
          </Label>
          <p className="text-sm text-muted-foreground">
            Rebuild images from scratch without Docker cache
          </p>
        </div>
        <Switch id="no-cache-build" checked={noCacheBuild} onCheckedChange={handleToggleNoCache} />
      </div>
    </div>
  )
}

// Compose file editor - embedded in General tab
function ComposeFileEditor({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
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
      <div className="py-4">
        <h4 className="font-medium mb-2">Compose File</h4>
        <p className="text-sm text-muted-foreground">Repository path not found</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="py-4">
        <h4 className="font-medium mb-2">Compose File</h4>
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4">
        <h4 className="font-medium mb-2">Compose File</h4>
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium">Compose File</h4>
        <div className="flex items-center gap-2">
          {/* Status indicators */}
          {hasChanges && isEditing && (
            <span className="text-xs text-muted-foreground">Unsaved</span>
          )}
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} />
              Saved
            </span>
          )}
          {writeCompose.isPending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Loading03Icon} size={12} strokeWidth={2} className="animate-spin" />
              Saving...
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
            {isEditing ? 'Done' : 'Edit'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-[300px] rounded-lg border overflow-hidden">
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
        <h3 className="text-lg font-semibold">Logs</h3>
        <p className="text-sm text-muted-foreground">
          Watch the logs of the application in real time
        </p>
      </div>

      {/* Container selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedService ?? ''}
          onChange={(e) => setSelectedService(e.target.value || undefined)}
          className="rounded-md border bg-background px-3 py-2 text-sm min-w-[240px]"
        >
          <option value="">All containers</option>
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
          <option value={50}>50 lines</option>
          <option value={100}>100 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="outline" size="sm" onClick={copyLogs} disabled={!data?.logs}>
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
              size={14}
              strokeWidth={2}
              className={copied ? 'text-green-500' : ''}
            />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadLogs} disabled={!data?.logs}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} className="rotate-[-90deg]" />
            Download
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-2 overflow-auto max-h-[600px] min-h-[300px] custom-logs-scrollbar">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-2">
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
            Loading logs...
          </div>
        ) : logs.length > 0 ? (
          logs.map((log, i) => <LogLine key={i} message={log.message} type={log.type} />)
        ) : (
          <span className="text-muted-foreground p-2">No logs available</span>
        )}
      </div>
    </div>
  )
}

// Deployments tab - Dokploy style clean list
function DeploymentsTab({ appId }: { appId: string }) {
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
        <h3 className="text-lg font-semibold">Deployments</h3>
        <p className="text-sm text-muted-foreground">
          See the last 10 deployments for this compose
        </p>
      </div>

      {!deployments?.length ? (
        <div className="py-8 text-center text-muted-foreground border rounded-lg">
          <p>No deployments yet</p>
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
  const getStatusInfo = () => {
    switch (deployment.status) {
      case 'running':
        return { text: 'Done', color: 'bg-green-500' }
      case 'failed':
        return { text: 'Error', color: 'bg-red-500' }
      case 'building':
      case 'pending':
        return { text: 'Building', color: 'bg-yellow-500' }
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
          View
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
          <DialogTitle>Deployment</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            See all the details of this deployment
            <span className="text-muted-foreground">|</span>
            <span>{logs.length} lines</span>
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
            <span className="text-muted-foreground p-2">No build logs available</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Environment tab - environment variables
function EnvironmentTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
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
        <h3 className="text-lg font-semibold">Environment Variables</h3>
        <p className="text-sm text-muted-foreground">
          Set environment variables for Docker Compose builds. These will be available during the build and in your
          containers.
        </p>
      </div>

      <Textarea
        value={envText}
        onChange={(e) => setEnvText(e.target.value)}
        placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=your-api-key\n# Comments are supported'}
        className="font-mono text-sm min-h-[200px]"
      />

      <div className="flex justify-end">
        <Button onClick={handleSaveEnv} disabled={updateApp.isPending}>
          {updateApp.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
              Saving...
            </>
          ) : envSaved ? (
            <>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} className="text-green-500" />
              Saved
            </>
          ) : (
            'Save Environment'
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
function DomainsTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
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
  }

  const updateService = (index: number, updates: Partial<(typeof services)[0]>) => {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)))
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold">Domain Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configure which services are exposed and their domain mappings
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
                    Expose
                  </Label>
                </div>
              </div>

              {service.exposed && (
                <div className="space-y-2">
                  <Label htmlFor={`domain-${index}`} className="text-sm">
                    Domain
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
          <p>No services configured. Deploy the app first to see available services.</p>
        </div>
      )}

      {/* Save button */}
      {services.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSaveDomains} disabled={updateApp.isPending}>
            {updateApp.isPending ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save Domains'
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
