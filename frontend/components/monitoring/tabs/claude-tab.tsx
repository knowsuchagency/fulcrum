import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { AGENT_DISPLAY_NAMES } from '@shared/types'
import {
  useClaudeInstances,
  useKillClaudeInstance,
  type ClaudeFilter,
  type ClaudeInstance,
} from '@/hooks/use-monitoring'

export default function ClaudeInstancesTab() {
  const { t } = useTranslation('monitoring')
  const [filter, setFilter] = useState<ClaudeFilter>('fulcrum')
  const [killingPid, setKillingPid] = useState<number | null>(null)
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
  const [isKillingSelected, setIsKillingSelected] = useState(false)
  const { data: instances, isLoading, error } = useClaudeInstances(filter)
  const killInstance = useKillClaudeInstance()

  const totalRam = instances?.reduce((sum, i) => sum + i.ramMB, 0) || 0
  const isAnyKilling = killingPid !== null || isKillingSelected

  // Clear killingPid when the instance is no longer in the list
  useEffect(() => {
    if (killingPid !== null && instances && !instances.some((i) => i.pid === killingPid)) {
      setKillingPid(null)
    }
  }, [killingPid, instances])

  // Clear selected PIDs that no longer exist
  useEffect(() => {
    if (selectedPids.size > 0 && instances) {
      const stillExists = new Set([...selectedPids].filter(pid => instances.some(i => i.pid === pid)))
      if (stillExists.size !== selectedPids.size) {
        setSelectedPids(stillExists)
      }
    }
  }, [selectedPids, instances])

  const handleKill = (instance: ClaudeInstance) => {
    setKillingPid(instance.pid)
    const payload = instance.isFulcrumManaged && instance.terminalId
      ? { terminalId: instance.terminalId }
      : { pid: instance.pid }
    killInstance.mutate(payload, {
      onError: () => setKillingPid(null),
    })
  }

  const toggleSelection = (pid: number) => {
    setSelectedPids(prev => {
      const next = new Set(prev)
      if (next.has(pid)) {
        next.delete(pid)
      } else {
        next.add(pid)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!instances) return
    if (selectedPids.size === instances.length) {
      setSelectedPids(new Set())
    } else {
      setSelectedPids(new Set(instances.map(i => i.pid)))
    }
  }

  const handleKillSelected = async () => {
    if (!instances || selectedPids.size === 0) return
    setIsKillingSelected(true)

    const toKill = instances.filter(i => selectedPids.has(i.pid))
    for (const instance of toKill) {
      const payload = instance.isFulcrumManaged && instance.terminalId
        ? { terminalId: instance.terminalId }
        : { pid: instance.pid }
      try {
        await killInstance.mutateAsync(payload)
      } catch {
        // Continue killing others even if one fails
      }
    }

    setSelectedPids(new Set())
    setIsKillingSelected(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-all"
              checked={filter === 'all'}
              onCheckedChange={(checked) => setFilter(checked ? 'all' : 'fulcrum')}
            />
            <Label htmlFor="show-all" className="text-sm text-muted-foreground">
              {t('claude.showAllInstances')}
            </Label>
          </div>

          {selectedPids.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleKillSelected}
              disabled={isAnyKilling}
              className="gap-1.5"
            >
              {isKillingSelected ? (
                <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
              ) : (
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              )}
              {t('claude.killSelected', { count: selectedPids.size })}
            </Button>
          )}
        </div>

        {instances && (
          <span className="text-sm text-muted-foreground">
            {t('claude.instanceCount', { count: instances.length })}
            {totalRam > 0 && ` · ${t('claude.totalRam', { ram: totalRam.toFixed(0) })}`}
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
          {t('claude.error', { message: error.message })}
        </div>
      )}

      {instances && instances.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {t('claude.empty')}
          {filter === 'fulcrum' && t('claude.emptyFulcrum')}
        </div>
      )}

      {instances && instances.length > 0 && (
        <div className="space-y-2">
          {/* Header - desktop only */}
          <div className="hidden lg:grid grid-cols-[32px_60px_100px_150px_1fr_1fr_80px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center justify-center">
              <Checkbox
                checked={selectedPids.size === instances.length}
                onCheckedChange={toggleSelectAll}
                disabled={isAnyKilling}
              />
            </div>
            <span>{t('claude.headers.pid')}</span>
            <span>{t('claude.headers.agent')}</span>
            <span>{t('claude.headers.terminal')}</span>
            <span>{t('claude.headers.task')}</span>
            <span>{t('claude.headers.workingDirectory')}</span>
            <span className="text-right">{t('claude.headers.ram')}</span>
            <span className="text-right">{t('claude.headers.actions')}</span>
          </div>

          {instances.map((instance) => (
            <Card key={instance.pid} className="px-3 py-2">
              {/* Mobile: stacked layout */}
              <div className="flex flex-col gap-1 lg:hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selectedPids.has(instance.pid)}
                      onCheckedChange={() => toggleSelection(instance.pid)}
                      disabled={isAnyKilling}
                      className="shrink-0"
                    />
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-xs',
                        instance.agent === 'claude' && 'border-purple-500/50 text-purple-600 dark:text-purple-400',
                        instance.agent === 'opencode' && 'border-teal-500/50 text-teal-600 dark:text-teal-400'
                      )}
                    >
                      {AGENT_DISPLAY_NAMES[instance.agent] || instance.agent}
                    </Badge>
                    <span className="text-sm font-medium truncate">
                      {instance.taskId ? (
                        <Link
                          to="/tasks/$taskId"
                          params={{ taskId: instance.taskId }}
                          className="hover:text-foreground hover:underline"
                        >
                          {instance.taskTitle}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {instance.isFulcrumManaged ? instance.terminalName : t('claude.source.external')}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-sm text-muted-foreground">{instance.ramMB.toFixed(0)} MB</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKill(instance)}
                      disabled={isAnyKilling}
                      className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
                    >
                      <HugeiconsIcon icon={killingPid === instance.pid ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${killingPid === instance.pid ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground truncate pl-6" title={instance.cwd}>
                  {instance.cwd}
                </span>
              </div>

              {/* Desktop: grid layout */}
              <div className="hidden lg:grid grid-cols-[32px_60px_100px_150px_1fr_1fr_80px_80px] items-center gap-4">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedPids.has(instance.pid)}
                    onCheckedChange={() => toggleSelection(instance.pid)}
                    disabled={isAnyKilling}
                  />
                </div>
                <span className="font-mono text-xs">{instance.pid}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs justify-center',
                    instance.agent === 'claude' && 'border-purple-500/50 text-purple-600 dark:text-purple-400',
                    instance.agent === 'opencode' && 'border-teal-500/50 text-teal-600 dark:text-teal-400'
                  )}
                >
                  {AGENT_DISPLAY_NAMES[instance.agent] || instance.agent}
                </Badge>
                <span className="truncate text-sm">
                  {instance.isFulcrumManaged ? (
                    <span>{instance.terminalName || `Terminal ${instance.terminalId?.slice(0, 8)}`}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('claude.source.external')}</span>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-sm">
                  {instance.taskId ? (
                    <Link
                      to="/tasks/$taskId"
                      params={{ taskId: instance.taskId }}
                      className="hover:text-foreground hover:underline"
                    >
                      {instance.taskTitle}
                    </Link>
                  ) : (
                    t('claude.noTask')
                  )}
                </span>
                <span className="text-muted-foreground truncate text-sm" title={instance.cwd}>
                  {instance.cwd}
                </span>
                <span className="text-right tabular-nums text-sm">{instance.ramMB.toFixed(0)} MB</span>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleKill(instance)}
                    disabled={isAnyKilling}
                    className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${isAnyKilling ? 'opacity-50' : ''}`}
                  >
                    <HugeiconsIcon icon={killingPid === instance.pid ? Loading03Icon : Cancel01Icon} className={`size-3.5 ${killingPid === instance.pid ? 'animate-spin' : ''}`} />
                    {killingPid === instance.pid ? t('claude.killing') : t('claude.kill')}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
