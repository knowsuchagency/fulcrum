import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useUpdateApp, useAppStatus, useDeploymentSettings } from '@/hooks/use-apps'
import type { App, ExposureMethod } from '@/types'
import { toast } from 'sonner'

interface ServicesConfigProps {
  app: App
  onDeploy: () => void
}

export function ServicesConfig({ app, onDeploy }: ServicesConfigProps) {
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
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t('detailView.app.services')}
      </h4>

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
                        onChange={(e) =>
                          updateService(index, { exposureMethod: e.target.value as ExposureMethod })
                        }
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
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={14}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                      ) : (
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          size={14}
                          strokeWidth={2}
                          className="text-green-500"
                        />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={14}
                        strokeWidth={2}
                        className="text-muted-foreground"
                      />
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
