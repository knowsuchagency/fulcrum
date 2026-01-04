import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, CheckmarkCircle02Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeployments } from '@/hooks/use-apps'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'
import { formatDuration, formatRelativeTime, type Deployment, type IDeploymentStreamStore } from './types'

interface DeploymentsTabProps {
  appId: string
  deployStore: IDeploymentStreamStore
  onViewStreamingLogs: () => void
}

export function DeploymentsTab({ appId, deployStore, onViewStreamingLogs }: DeploymentsTabProps) {
  const { t } = useTranslation('common')
  const { data: deployments, isLoading } = useDeployments(appId)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const handleViewLogs = (deployment: Deployment) => {
    // If deployment is in progress (building/pending), show streaming modal
    // Otherwise show the database logs modal
    if (deployment.status === 'building' || deployment.status === 'pending') {
      // If not already streaming this deployment, reconnect to watch the logs
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
