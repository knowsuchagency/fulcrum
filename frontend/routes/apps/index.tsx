import { useState, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { fuzzyScore } from '@/lib/fuzzy-search'
import { useApps, useDeployApp, useStopApp, useDeleteApp } from '@/hooks/use-apps'
import type { AppWithServices } from '@/hooks/use-apps'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  Loading03Icon,
  Alert02Icon,
  Search01Icon,
  Play01Icon,
  Stop01Icon,
  Delete02Icon,
  Rocket01Icon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
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

export const Route = createFileRoute('/apps/')({
  component: AppsView,
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

function AppCard({
  app,
  onDeploy,
  onStop,
  onDelete,
}: {
  app: AppWithServices
  onDeploy: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const exposedServices = app.services?.filter((s) => s.exposed) ?? []
  const primaryDomain = exposedServices.find((s) => s.domain)?.domain

  return (
    <Card className="h-full group transition-colors hover:border-foreground/20">
      <Link to="/apps/$appId" params={{ appId: app.id }} className="block">
        <CardContent className="flex flex-col gap-3 py-4">
          {/* Header: Status indicator + Name */}
          <div className="flex items-start gap-3">
            <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${getStatusColor(app.status)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="block truncate font-medium group-hover:text-primary transition-colors">
                  {app.name}
                </span>
                <Badge variant={getStatusBadgeVariant(app.status)} className="shrink-0 capitalize">
                  {app.status}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {app.repository?.displayName ?? 'Unknown repo'} · {app.branch}
              </div>
            </div>
          </div>

          {/* Primary domain if exposed */}
          {primaryDomain && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{primaryDomain}</span>
            </div>
          )}

          {/* Services count */}
          <div className="text-xs text-muted-foreground">
            {app.services?.length ?? 0} service{(app.services?.length ?? 0) !== 1 ? 's' : ''} ·{' '}
            {exposedServices.length} exposed
          </div>

          {/* Last deployed */}
          {app.lastDeployedAt && (
            <div className="text-xs text-muted-foreground">
              Last deployed: {new Date(app.lastDeployedAt).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Link>

      <CardContent className="pt-0 pb-4 px-6">
        <div className="mt-auto flex flex-wrap gap-1">
          {app.status === 'running' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Stop01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">Stop</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeploy}
              className="text-muted-foreground hover:text-foreground"
              disabled={app.status === 'building'}
            >
              {app.status === 'building' ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  strokeWidth={2}
                  className="animate-spin"
                  data-slot="icon"
                />
              ) : (
                <HugeiconsIcon icon={Play01Icon} size={14} strokeWidth={2} data-slot="icon" />
              )}
              <span className="max-sm:hidden">{app.status === 'building' ? 'Building...' : 'Deploy'}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AppsView() {
  const { data: apps, isLoading, error } = useApps()
  const deployApp = useDeployApp()
  const stopApp = useStopApp()
  const deleteApp = useDeleteApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AppWithServices | null>(null)

  const filteredApps = useMemo(() => {
    if (!apps) return []
    if (!searchQuery?.trim()) return apps
    return apps
      .map((app) => ({
        app,
        score: Math.max(
          fuzzyScore(app.name, searchQuery),
          fuzzyScore(app.repository?.displayName ?? '', searchQuery)
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ app }) => app)
  }, [apps, searchQuery])

  const handleDeploy = async (appId: string) => {
    await deployApp.mutateAsync(appId)
  }

  const handleStop = async (appId: string) => {
    await stopApp.mutateAsync(appId)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteApp.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <HugeiconsIcon
            icon={Search01Icon}
            size={12}
            strokeWidth={2}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps..."
            className="w-full pl-6"
          />
        </div>
        <div className="hidden sm:block flex-1" />
        <Link to="/apps/new">
          <Button size="sm">
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">New App</span>
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-auto p-4">
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
            <span className="text-sm">Failed to load apps: {error.message}</span>
          </div>
        )}

        {!isLoading && !error && apps?.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <HugeiconsIcon icon={Rocket01Icon} size={48} strokeWidth={1.5} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">No apps yet. Create your first app to get started!</p>
            <Link to="/apps/new" className="mt-4 inline-block">
              <Button>
                <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} data-slot="icon" />
                Create App
              </Button>
            </Link>
          </div>
        )}

        {!isLoading && !error && apps && apps.length > 0 && filteredApps.length === 0 && (
          <div className="py-12 text-muted-foreground">
            <p className="text-sm">No apps match your search.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onDeploy={() => handleDeploy(app.id)}
              onStop={() => handleStop(app.id)}
              onDelete={() => setDeleteTarget(app)}
            />
          ))}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete App</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will stop all containers and remove the app
              configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
