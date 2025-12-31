import { FancyAnsi } from 'fancy-ansi'
import { cn } from '@/lib/utils'
import type { LogType } from '@/lib/log-utils'

const fancyAnsi = new FancyAnsi()

const TYPE_STYLES: Record<LogType, { bg: string; badge: string; border: string }> = {
  error: {
    bg: 'bg-red-500/10 hover:bg-red-500/15',
    badge: 'bg-red-600/20 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    border: 'bg-red-500',
  },
  warning: {
    bg: 'bg-yellow-500/10 hover:bg-yellow-500/15',
    badge: 'bg-yellow-600/20 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400',
    border: 'bg-yellow-500',
  },
  success: {
    bg: 'bg-green-500/10 hover:bg-green-500/15',
    badge: 'bg-emerald-600/20 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    border: 'bg-green-500',
  },
  info: {
    bg: 'hover:bg-muted/50',
    badge: 'bg-blue-600/20 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    border: 'bg-blue-500',
  },
  debug: {
    bg: 'bg-orange-500/10 hover:bg-orange-500/15',
    badge: 'bg-orange-600/20 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    border: 'bg-orange-500',
  },
}

export function LogLine({ message, type }: { message: string; type: LogType }) {
  const styles = TYPE_STYLES[type]
  const html = fancyAnsi.toHtml(message)

  return (
    <div className={cn('flex items-start gap-2 py-0.5 font-mono text-xs', styles.bg)}>
      {/* Left border indicator */}
      <div className={cn('w-0.5 self-stretch rounded-full shrink-0', styles.border)} />

      {/* Type badge */}
      <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px] font-medium w-12 text-center', styles.badge)}>
        {type}
      </span>

      {/* ANSI-formatted message */}
      <span
        className="whitespace-pre-wrap break-all text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
