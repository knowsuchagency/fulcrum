import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useUpdateApp } from '@/hooks/use-apps'
import type { App } from '@/types'
import type { IDeploymentStreamStore } from '@/stores'

interface DeployControlsProps {
  app: App
  onDeploy: () => void
  onStop: () => void
  onCancelDeploy: () => void
  isBuilding: boolean
  isRunning: boolean
  isStopPending: boolean
  isCancelPending: boolean
  deployStore: IDeploymentStreamStore
}

export function DeployControls({
  app,
  onDeploy,
  onStop,
  onCancelDeploy,
  isBuilding,
  isRunning,
  isStopPending,
  isCancelPending,
  deployStore,
}: DeployControlsProps) {
  const { t } = useTranslation('projects')
  const tCommon = useTranslation('common').t
  const updateApp = useUpdateApp()

  const handleAutoDeployToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { autoDeployEnabled: enabled },
    })
  }

  const handleAutoPortAllocationToggle = async (enabled: boolean) => {
    await updateApp.mutateAsync({
      id: app.id,
      updates: { autoPortAllocation: enabled },
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
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('detailView.tabs.deploy')}
        </h4>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onDeploy} disabled={isBuilding}>
            {isBuilding ? (
              <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
            )}
            {deployStore.isDeploying
              ? tCommon('apps.deploying')
              : app.status === 'building'
                ? tCommon('apps.building')
                : t('deploy')}
          </Button>
          {isBuilding ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancelDeploy}
              disabled={isCancelPending}
            >
              {isCancelPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
              )}
              {isCancelPending ? tCommon('apps.cancelling') : tCommon('apps.cancelDeploy')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              disabled={isStopPending || !isRunning}
            >
              {isStopPending ? (
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
              )}
              {t('stop')}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={app.autoDeployEnabled ?? false}
            onCheckedChange={(checked) => handleAutoDeployToggle(checked === true)}
          />
          <span>{t('detailView.app.autoDeployEnabled')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={app.autoPortAllocation ?? true}
            onCheckedChange={(checked) => handleAutoPortAllocationToggle(checked === true)}
          />
          <span>{t('detailView.app.autoPortAllocation')}</span>
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
