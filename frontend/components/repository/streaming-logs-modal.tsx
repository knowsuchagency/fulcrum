import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { reaction } from 'mobx'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCancelDeployment } from '@/hooks/use-apps'
import { parseLogs } from '@/lib/log-utils'
import { LogLine } from '@/components/ui/log-line'
import type { IDeploymentStreamStore, DeploymentStage } from '@/stores'

interface StreamingLogsModalProps {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  deployStore: IDeploymentStreamStore
}

export function StreamingLogsModal({
  appId,
  open,
  onOpenChange,
  deployStore,
}: StreamingLogsModalProps) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const cancelDeployment = useCancelDeployment()

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
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={16}
                strokeWidth={2}
                className="text-green-500"
              />
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
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={14}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                  )}
                  {cancelDeployment.isPending ? t('apps.cancelling') : t('apps.cancelDeploy')}
                </Button>
              </>
            )}
            <span className="text-muted-foreground">|</span>
            <span>
              {parsedLogs.length} {t('apps.logs.lines')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyLogs}
              disabled={logs.length === 0}
            >
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
