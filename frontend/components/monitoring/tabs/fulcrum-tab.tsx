import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useFulcrumInstances, useKillFulcrumInstance, type FulcrumInstanceGroup } from '@/hooks/use-monitoring'

export default function FulcrumInstancesTab() {
  const { t } = useTranslation('monitoring')
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const { data: instances, isLoading, error } = useFulcrumInstances()
  const killInstance = useKillFulcrumInstance()

  // Clear killingPid when the instance is no longer in the list
  useEffect(() => {
    if (killingPid !== null && instances && !instances.some((g) => g.backend?.pid === killingPid)) {
      setKillingPid(null)
    }
  }, [killingPid, instances])

  const handleKill = (group: FulcrumInstanceGroup) => {
    if (!group.backend) return
    setKillingPid(group.backend.pid)
    killInstance.mutate(
      { backendPid: group.backend.pid },
      { onError: () => setKillingPid(null) }
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t('fulcrum.description')}
        </span>
        {instances && instances.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {t('fulcrum.instanceCount', { count: instances.length })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t('fulcrum.error', { message: error.message })}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {t('fulcrum.empty')}
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[80px_100px_1fr_100px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>{t('fulcrum.headers.port')}</span>
            <span>{t('fulcrum.headers.mode')}</span>
            <span>{t('fulcrum.headers.directory')}</span>
            <span className="text-right">{t('fulcrum.headers.ram')}</span>
            <span className="text-right">{t('fulcrum.headers.actions')}</span>
          </div>

          {instances.map((group) => {
            const isKilling = killingPid === group.backend?.pid
            const isAnyKilling = killingPid !== null
            return (
              <Card key={group.backend?.pid || group.port} className="px-3 py-2">
                {/* Mobile: stacked layout */}
                <div className="flex flex-col gap-1 lg:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      <span className="font-mono">:{group.port}</span>
                      <span className={`ml-2 text-xs ${group.mode === 'development' ? 'text-muted-foreground' : ''}`}>
                        {group.mode === 'development' ? t('fulcrum.mode.dev') : t('fulcrum.mode.prod')}
                        {group.frontend && ` + ${t('fulcrum.vite')}`}
                      </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-sm text-muted-foreground">{group.totalMemoryMB.toFixed(0)} MB</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleKill(group)}
                        disabled={isAnyKilling || !group.backend}
                        className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
                      >
                        <HugeiconsIcon icon={isKilling ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${isKilling ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground truncate" title={group.fulcrumDir}>
                    {group.fulcrumDir}
                  </span>
                </div>

                {/* Desktop: grid layout */}
                <div className="hidden lg:grid grid-cols-[80px_100px_1fr_100px_80px] items-center gap-4">
                  <span className="font-mono text-sm">{group.port}</span>
                  <span className={`text-xs ${group.mode === 'development' ? 'text-muted-foreground' : ''}`}>
                    {group.mode === 'development' ? t('fulcrum.mode.dev') : t('fulcrum.mode.prod')}
                    {group.frontend && ` + ${t('fulcrum.vite')}`}
                  </span>
                  <span className="text-muted-foreground truncate text-sm" title={group.fulcrumDir}>
                    {group.fulcrumDir}
                  </span>
                  <span className="text-right tabular-nums text-sm">
                    {group.totalMemoryMB.toFixed(0)} MB
                  </span>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(group)}
                      disabled={isAnyKilling || !group.backend}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
                    >
                      <HugeiconsIcon icon={isKilling ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${isKilling ? 'animate-spin' : ''}`} />
                      {isKilling ? t('fulcrum.killing') : t('fulcrum.kill')}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
