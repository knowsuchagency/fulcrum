import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { Card } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useTopProcesses, useDockerStats, type ProcessSortBy } from '@/hooks/use-monitoring'

export default function ProcessesTab() {
  const { t } = useTranslation('monitoring')
  const [sortBy, setSortBy] = useState<ProcessSortBy>('memory')
  const { data: processes, isLoading: processesLoading, error: processesError } = useTopProcesses(sortBy)
  const { data: dockerData, isLoading: dockerLoading } = useDockerStats()

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Top Processes */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">{t('processes.topProcesses')}</h3>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ProcessSortBy)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="memory">{t('processes.sortBy.memory')}</SelectItem>
              <SelectItem value="cpu">{t('processes.sortBy.cpu')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {processesLoading && (
          <div className="flex items-center justify-center flex-1">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {processesError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {t('processes.error', { message: processesError.message })}
          </div>
        )}

        {processes && processes.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[60px_120px_1fr_70px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>{t('processes.headers.pid')}</span>
                <span>{t('processes.headers.name')}</span>
                <span>{t('processes.headers.command')}</span>
                <span className="text-right">{t('processes.headers.memory')}</span>
                <span className="text-right">%</span>
              </div>
              {processes.map((proc) => (
                <div
                  key={proc.pid}
                  className="grid grid-cols-[60px_120px_1fr_70px_80px] gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground">{proc.pid}</span>
                  <span className="truncate font-medium" title={proc.name}>
                    {proc.name}
                  </span>
                  <span className="truncate text-muted-foreground text-xs" title={proc.command}>
                    {proc.command}
                  </span>
                  <span className="text-right tabular-nums">{proc.memoryMB.toFixed(0)} MB</span>
                  <span className="text-right tabular-nums text-muted-foreground">{proc.memoryPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {processes && processes.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">{t('processes.empty')}</div>
        )}
      </Card>

      {/* Docker Containers */}
      <Card className="p-4 lg:flex-1 lg:min-w-0 h-[400px] flex flex-col">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h3 className="font-medium">
            {t('processes.containers')}
            {dockerData?.runtime && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({dockerData.runtime})</span>
            )}
          </h3>
        </div>

        {dockerLoading && (
          <div className="flex items-center justify-center flex-1">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {dockerData && !dockerData.available && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {t('processes.containersUnavailable')}
          </div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">{t('processes.containersEmpty')}</div>
        )}

        {dockerData && dockerData.available && dockerData.containers.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_70px_100px_80px] gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>{t('processes.headers.name')}</span>
                <span className="text-right">CPU</span>
                <span className="text-right">{t('processes.headers.memory')}</span>
                <span className="text-right">%</span>
              </div>
              {dockerData.containers.map((container) => (
                <div
                  key={container.id}
                  className="grid grid-cols-[1fr_70px_100px_80px] gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="truncate font-medium" title={container.name}>
                    {container.name}
                  </span>
                  <span className="text-right tabular-nums">{container.cpuPercent.toFixed(1)}%</span>
                  <span className="text-right tabular-nums">
                    {container.memoryMB.toFixed(0)} / {container.memoryLimit.toFixed(0)} MB
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{container.memoryPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
