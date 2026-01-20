import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { useDockerStats, type ContainerStats } from '@/hooks/use-monitoring'

interface MonitoringTabProps {
  appId: string
  repoDisplayName?: string
}

// Colors for distribution charts
const DISTRIBUTION_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// Helper to extract service name from container name
function extractServiceName(containerName: string): string {
  // Docker Swarm format: project_service.replica.taskid
  // Example: "fulcrum-bg-qczqd_pocketbase.1.abc123" -> "pocketbase"

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
    return `fulcrum-${sanitized}-${suffix}`
  }
  return `fulcrum-${suffix}`
}

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

export function MonitoringTab({ appId, repoDisplayName }: MonitoringTabProps) {
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
