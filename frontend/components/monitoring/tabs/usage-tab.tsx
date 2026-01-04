import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { Card } from '@/components/ui/card'
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { useClaudeUsage } from '@/hooks/use-monitoring'
import { desktopZoom } from '@/main'

// Helper to get text color class based on usage percentage
function getUsageTextColor(percent: number): string {
  if (percent >= 90) return 'text-destructive'      // Cinnabar
  if (percent >= 70) return 'text-muted-foreground' // Lavender Grey
  return 'text-chart-system'                        // Stormy Teal (light) / Cinnabar (dark)
}

// Helper to format time remaining
function formatTimeRemaining(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Helper to format reset date
function formatResetDate(resetAt: string): string {
  const date = new Date(resetAt)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return `Tomorrow ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Radial gauge component for usage visualization
function UsageGauge({
  percent,
  label,
  subtitle,
  color,
}: {
  percent: number
  label: string
  subtitle: string
  color: string
}) {
  const data = [{ value: Math.min(percent, 100), fill: color }]

  // Scale pixel values for desktop zoom (rem-based container scales, but Recharts uses pixels)
  const size = Math.round(96 * desktopZoom)
  const center = Math.round(48 * desktopZoom)
  const innerRadius = Math.round(32 * desktopZoom)
  const outerRadius = Math.round(44 * desktopZoom)
  const barSize = Math.round(10 * desktopZoom)
  const cornerRadius = Math.round(5 * desktopZoom)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <RadialBarChart
            width={size}
            height={size}
            cx={center}
            cy={center}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            barSize={barSize}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: 'var(--border)' }}
              dataKey="value"
              cornerRadius={cornerRadius}
              angleAxisId={0}
            />
          </RadialBarChart>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-semibold tabular-nums ${getUsageTextColor(percent)}`}>
              {percent.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate">{label}</h3>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
    </Card>
  )
}

export default function ClaudeUsageLimitsTab() {
  const { t } = useTranslation('monitoring')
  const { data: usage, isLoading, error } = useClaudeUsage()

  // Get color based on usage level
  const getGaugeColor = (percent: number): string => {
    if (percent >= 90) return 'var(--destructive)'      // Cinnabar
    if (percent >= 70) return 'var(--muted-foreground)' // Lavender Grey
    return 'var(--chart-system)'                        // Stormy Teal (light) / Cinnabar (dark)
  }

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t('usage.error', { message: error.message })}
        </div>
      )}

      {usage && !usage.available && (
        <div className="rounded-lg border border-muted-foreground/50 bg-muted p-4 text-sm text-muted-foreground">
          {usage.error || t('usage.unavailable')}
        </div>
      )}

      {usage && usage.available && (
        <div className="space-y-3">
          {/* Main usage gauges */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* 5-Hour Block */}
            {usage.fiveHour && (
              <UsageGauge
                percent={usage.fiveHour.percentUsed}
                label={t('usage.fiveHourBlock')}
                subtitle={t('usage.resetsIn', { time: formatTimeRemaining(usage.fiveHour.timeRemainingMinutes) })}
                color={getGaugeColor(usage.fiveHour.percentUsed)}
              />
            )}

            {/* 7-Day Rolling */}
            {usage.sevenDay && (
              <UsageGauge
                percent={usage.sevenDay.percentUsed}
                label={t('usage.sevenDayRolling')}
                subtitle={`${t('usage.resetsAt', { time: formatResetDate(usage.sevenDay.resetAt) })} · ${t('usage.weekProgress', { percent: usage.sevenDay.weekProgressPercent })}`}
                color={getGaugeColor(usage.sevenDay.percentUsed)}
              />
            )}
          </div>

          {/* Model-specific limits (Opus/Sonnet) */}
          {(usage.sevenDayOpus || usage.sevenDaySonnet) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {usage.sevenDayOpus && (
                <UsageGauge
                  percent={usage.sevenDayOpus.percentUsed}
                  label={t('usage.opusWeekly')}
                  subtitle={t('usage.resetsAt', { time: formatResetDate(usage.sevenDayOpus.resetAt) })}
                  color={getGaugeColor(usage.sevenDayOpus.percentUsed)}
                />
              )}

              {usage.sevenDaySonnet && (
                <UsageGauge
                  percent={usage.sevenDaySonnet.percentUsed}
                  label={t('usage.sonnetWeekly')}
                  subtitle={t('usage.resetsAt', { time: formatResetDate(usage.sevenDaySonnet.resetAt) })}
                  color={getGaugeColor(usage.sevenDaySonnet.percentUsed)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
