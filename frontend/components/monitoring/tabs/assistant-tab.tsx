import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  FilterIcon,
  Mail01Icon,
  MessageMultiple01Icon,
  SentIcon,
  ViewIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  AlertCircleIcon,
} from '@hugeicons/core-free-icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ContentRenderer } from '@/components/assistant/content-renderer'
import { useActionableEvents, useSweepRuns, useAssistantStats } from '@/hooks/use-assistant'
import type { ActionableEvent, SweepRun } from '@/hooks/use-assistant'

// Sweeps running longer than 5 minutes are considered stale (likely from dev server restart)
const STALE_THRESHOLD_MS = 5 * 60 * 1000

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'pending':
      return 'default'
    case 'acted_upon':
      return 'secondary'
    case 'dismissed':
      return 'outline'
    case 'monitoring':
      return 'default'
    default:
      return 'outline'
  }
}

function getSweepStatusIcon(status: string, isStale: boolean) {
  if (isStale) return AlertCircleIcon
  switch (status) {
    case 'completed':
      return CheckmarkCircle02Icon
    case 'failed':
      return Cancel01Icon
    case 'running':
      return Loading03Icon
    default:
      return Clock01Icon
  }
}

function getSweepStatusColor(status: string, isStale: boolean): string {
  if (isStale) return 'text-yellow-500'
  switch (status) {
    case 'completed':
      return 'text-green-500'
    case 'failed':
      return 'text-destructive'
    case 'running':
      return 'text-blue-500 animate-spin'
    default:
      return 'text-muted-foreground'
  }
}

function isSweepStale(sweep: SweepRun): boolean {
  if (sweep.status !== 'running') return false
  const startedAt = new Date(sweep.startedAt).getTime()
  const now = Date.now()
  return now - startedAt > STALE_THRESHOLD_MS
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email':
      return Mail01Icon
    case 'slack':
    case 'discord':
    case 'telegram':
    case 'whatsapp':
      return MessageMultiple01Icon
    default:
      return SentIcon
  }
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="py-3 px-4">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

function EventRow({ event }: { event: ActionableEvent }) {
  const { t } = useTranslation('monitoring')
  const ChannelIcon = getChannelIcon(event.sourceChannel)

  // Extract useful info from sourceMetadata
  const metadata = event.sourceMetadata as Record<string, unknown> | null
  const sender = (metadata?.from || metadata?.sender || metadata?.fromAddress) as string | undefined
  const subject = metadata?.subject as string | undefined

  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="mt-0.5">
        <HugeiconsIcon icon={ChannelIcon} size={16} strokeWidth={2} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={getStatusBadgeVariant(event.status)} className="text-xs">
            {event.status.replace('_', ' ')}
          </Badge>
          <span className="text-sm truncate">
            {event.summary || subject || `${event.sourceChannel} event`}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="capitalize">{event.sourceChannel}</span>
          {sender && <span className="truncate">{sender}</span>}
          <span>{formatRelativeTime(event.createdAt)}</span>
          {event.linkedTaskId && (
            <Link
              to="/tasks/$taskId"
              params={{ taskId: event.linkedTaskId }}
              className="text-primary hover:underline"
            >
              {t('assistant.events.linkedTask')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function SweepRow({ sweep }: { sweep: SweepRun }) {
  const { t } = useTranslation('monitoring')
  const [isOpen, setIsOpen] = useState(false)
  const stale = isSweepStale(sweep)
  const StatusIcon = getSweepStatusIcon(sweep.status, stale)
  const statusColor = getSweepStatusColor(sweep.status, stale)

  const typeLabel = sweep.type === 'hourly'
    ? t('assistant.sweeps.hourly')
    : sweep.type === 'morning_ritual'
    ? t('assistant.sweeps.morningRitual')
    : t('assistant.sweeps.eveningRitual')

  const hasSummary = sweep.summary && sweep.summary.trim().length > 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild disabled={!hasSummary}>
        <div className={`flex items-center gap-3 p-3 border-b last:border-b-0 ${hasSummary ? 'cursor-pointer hover:bg-muted/50' : ''}`}>
          <HugeiconsIcon icon={StatusIcon} size={16} strokeWidth={2} className={statusColor} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(sweep.startedAt)}
              </span>
              {stale && (
                <Badge variant="secondary" className="text-xs">stale</Badge>
              )}
            </div>
            {sweep.status === 'completed' && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {sweep.eventsProcessed !== null && (
                  <span>{t('assistant.sweeps.eventsProcessed', { count: sweep.eventsProcessed })}</span>
                )}
                {sweep.tasksUpdated !== null && sweep.tasksUpdated > 0 && (
                  <span>{t('assistant.sweeps.tasksUpdated', { count: sweep.tasksUpdated })}</span>
                )}
                {sweep.messagesSent !== null && sweep.messagesSent > 0 && (
                  <span>{t('assistant.sweeps.messagesSent', { count: sweep.messagesSent })}</span>
                )}
              </div>
            )}
            {hasSummary && !isOpen && (
              <div className="mt-1 text-xs text-muted-foreground truncate">{sweep.summary}</div>
            )}
          </div>
          {hasSummary && (
            <HugeiconsIcon
              icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon}
              size={14}
              strokeWidth={2}
              className="text-muted-foreground shrink-0"
            />
          )}
        </div>
      </CollapsibleTrigger>
      {hasSummary && (
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-b last:border-b-0 bg-muted/30">
            <ContentRenderer content={sweep.summary!} className="text-sm" />
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export default function AssistantTab() {
  const { t } = useTranslation('monitoring')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: stats, isLoading: statsLoading } = useAssistantStats()
  const { data: eventsData, isLoading: eventsLoading, error: eventsError } = useActionableEvents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 20,
  })
  const { data: sweepsData, isLoading: sweepsLoading } = useSweepRuns({ limit: 10 })

  const isLoading = statsLoading || eventsLoading || sweepsLoading

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('assistant.stats.pending')} value={stats.events.pending} />
          <StatCard label={t('assistant.stats.actedUpon')} value={stats.events.actedUpon} />
          <StatCard label={t('assistant.stats.dismissed')} value={stats.events.dismissed} />
          <StatCard label={t('assistant.stats.monitoring')} value={stats.events.monitoring} />
        </div>
      )}

      {/* Loading State */}
      {isLoading && !stats && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {eventsError && (
        <div className="flex items-center gap-3 py-6 text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
          <span className="text-sm">{eventsError.message}</span>
        </div>
      )}

      {/* Actionable Events */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={2} />
              {t('assistant.events.title')}
            </CardTitle>
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger size="sm" className="w-[140px] shrink-0 gap-1.5">
                <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} className="text-muted-foreground" />
                <SelectValue>
                  {statusFilter === 'all' ? 'All' : statusFilter.replace('_', ' ')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="acted_upon">Acted Upon</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {eventsData?.events && eventsData.events.length > 0 ? (
            <div className="divide-y">
              {eventsData.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('assistant.events.empty')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Sweeps */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={2} />
            {t('assistant.sweeps.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sweepsData?.runs && sweepsData.runs.length > 0 ? (
            <div className="divide-y">
              {sweepsData.runs.map((sweep) => (
                <SweepRow key={sweep.id} sweep={sweep} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('assistant.sweeps.empty')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
