import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useApp,
  useDeployApp,
  useStopApp,
  useAppLogs,
  useDeployments,
  useAppStatus,
  useUpdateApp,
} from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Loading03Icon,
  Alert02Icon,
  PlayIcon,
  StopIcon,
  RefreshIcon,
  Link01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Clock01Icon,
} from '@hugeicons/core-free-icons'
import type { Deployment } from '@/types'

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailView,
})

function getStatusColor(status: string) {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'building':
      return 'bg-yellow-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
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
  const { data: app, isLoading, error } = useApp(appId)
  const deployApp = useDeployApp()
  const stopApp = useStopApp()
  const [activeTab, setActiveTab] = useState('overview')

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

  const handleDeploy = async () => {
    await deployApp.mutateAsync(appId)
  }

  const handleStop = async () => {
    await stopApp.mutateAsync(appId)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-background px-4 py-2">
        <Link to="/apps" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          <span className="text-sm">Apps</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(app.status)}`} />
          <span className="font-medium">{app.name}</span>
          <Badge variant={getStatusBadgeVariant(app.status)} className="capitalize">
            {app.status}
          </Badge>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {app.status === 'running' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={stopApp.isPending}
            >
              {stopApp.isPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
              )}
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleDeploy}
              disabled={deployApp.isPending || app.status === 'building'}
            >
              {deployApp.isPending || app.status === 'building' ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
              )}
              {app.status === 'building' ? 'Building...' : 'Deploy'}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab app={app} />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab appId={appId} services={app.services} />
          </TabsContent>

          <TabsContent value="deployments">
            <DeploymentsTab appId={appId} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab app={app} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Overview tab
function OverviewTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const { data: status } = useAppStatus(app.id)
  const exposedServices = app.services?.filter((s) => s.exposed) ?? []
  const internalServices = app.services?.filter((s) => !s.exposed) ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${getStatusColor(app.status)}`} />
            <span className="font-medium capitalize">{app.status}</span>
            {app.lastDeployedAt && (
              <span className="text-sm text-muted-foreground">
                · Deployed {new Date(app.lastDeployedAt).toLocaleString()}
                {app.lastDeployCommit && ` (${app.lastDeployCommit})`}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {app.repository?.displayName ?? 'Unknown'} · {app.branch}
          </div>
        </CardContent>
      </Card>

      {/* Exposed Services */}
      {exposedServices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exposed Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {exposedServices.map((service) => {
                const container = status?.containers.find((c) => c.service === service.serviceName)
                return (
                  <div key={service.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          container?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                      <span className="font-medium">{service.serviceName}</span>
                      {service.domain && (
                        <a
                          href={`https://${service.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} />
                          {service.domain}
                        </a>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {container?.status ?? service.status ?? 'stopped'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Internal Services */}
      {internalServices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {internalServices.map((service) => {
                const container = status?.containers.find((c) => c.service === service.serviceName)
                return (
                  <div key={service.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          container?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                      <span className="font-medium">{service.serviceName}</span>
                      {service.containerPort && (
                        <span className="text-sm text-muted-foreground">:{service.containerPort}</span>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {container?.status ?? service.status ?? 'stopped'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Logs tab
function LogsTab({
  appId,
  services,
}: {
  appId: string
  services?: NonNullable<ReturnType<typeof useApp>['data']>['services']
}) {
  const [selectedService, setSelectedService] = useState<string | undefined>()
  const [tail, setTail] = useState(100)
  const { data, isLoading, refetch } = useAppLogs(appId, selectedService, tail)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={selectedService ?? ''}
          onChange={(e) => setSelectedService(e.target.value || undefined)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All services</option>
          {services?.map((s) => (
            <option key={s.id} value={s.serviceName}>
              {s.serviceName}
            </option>
          ))}
        </select>

        <select
          value={tail}
          onChange={(e) => setTail(parseInt(e.target.value, 10))}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value={50}>Last 50 lines</option>
          <option value={100}>Last 100 lines</option>
          <option value={500}>Last 500 lines</option>
          <option value={1000}>Last 1000 lines</option>
        </select>

        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border bg-black p-4 font-mono text-xs text-green-400 overflow-auto max-h-[600px]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
            Loading logs...
          </div>
        ) : data?.logs ? (
          <pre className="whitespace-pre-wrap">{data.logs}</pre>
        ) : (
          <span className="text-muted-foreground">No logs available</span>
        )}
      </div>
    </div>
  )
}

// Deployments tab
function DeploymentsTab({ appId }: { appId: string }) {
  const { data: deployments, isLoading } = useDeployments(appId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deployments?.length) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No deployments yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {deployments.map((deployment) => (
        <DeploymentCard key={deployment.id} deployment={deployment} />
      ))}
    </div>
  )
}

function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const getIcon = () => {
    switch (deployment.status) {
      case 'running':
        return <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} className="text-green-500" />
      case 'failed':
        return <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} className="text-red-500" />
      case 'building':
      case 'pending':
        return <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin text-yellow-500" />
      default:
        return <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
    }
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{deployment.gitCommit ?? 'unknown'}</span>
              <Badge variant="outline" className="capitalize">
                {deployment.status}
              </Badge>
              {deployment.deployedBy && (
                <Badge variant="secondary" className="capitalize">
                  {deployment.deployedBy}
                </Badge>
              )}
            </div>
            {deployment.gitMessage && (
              <p className="mt-1 text-sm text-muted-foreground truncate">{deployment.gitMessage}</p>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              Started: {new Date(deployment.startedAt).toLocaleString()}
              {deployment.completedAt && ` · Completed: ${new Date(deployment.completedAt).toLocaleString()}`}
            </div>
            {deployment.errorMessage && (
              <p className="mt-2 text-sm text-destructive">{deployment.errorMessage}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Settings tab
function SettingsTab({ app }: { app: NonNullable<ReturnType<typeof useApp>['data']> }) {
  const updateApp = useUpdateApp()
  const [name, setName] = useState(app.name)
  const [branch, setBranch] = useState(app.branch)
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(app.autoDeployEnabled ?? false)
  const [services, setServices] = useState(
    app.services?.map((s) => ({
      serviceName: s.serviceName,
      containerPort: s.containerPort,
      exposed: s.exposed,
      domain: s.domain ?? '',
    })) ?? []
  )

  const handleSave = async () => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: {
        name,
        branch,
        autoDeployEnabled,
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
    <div className="space-y-6 max-w-2xl">
      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">App Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="autoDeployEnabled"
              checked={autoDeployEnabled}
              onCheckedChange={(checked) => setAutoDeployEnabled(checked === true)}
            />
            <Label htmlFor="autoDeployEnabled">Auto-deploy on push to {branch}</Label>
          </div>
        </CardContent>
      </Card>

      {/* Exposed Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exposed Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateApp.isPending}>
          {updateApp.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>

      {updateApp.error && (
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span className="text-sm">{updateApp.error.message}</span>
        </div>
      )}
    </div>
  )
}
