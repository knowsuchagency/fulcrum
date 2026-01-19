import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon, CheckmarkCircle02Icon, ViewOffIcon, EyeIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useUpdateApp } from '@/hooks/use-apps'
import type { App } from '@/types'

interface EnvironmentConfigProps {
  app: App
}

export function EnvironmentConfig({ app }: EnvironmentConfigProps) {
  const { t } = useTranslation('common')
  const updateApp = useUpdateApp()

  const envVarsToText = (envVars: Record<string, string> | null | undefined) => {
    return Object.entries(envVars ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }

  const [envText, setEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [savedEnvText, setSavedEnvText] = useState(() => envVarsToText(app.environmentVariables))
  const [envSaved, setEnvSaved] = useState(false)
  const [masked, setMasked] = useState(true)

  const hasUnsavedChanges = envText !== savedEnvText

  const maskedLines = useMemo(() => {
    return envText.split('\n').map((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) return { type: 'empty' as const, id: i }
      if (trimmed.startsWith('#')) return { type: 'comment' as const, text: line, id: i }
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const keyLen = trimmed.slice(0, eqIndex).length
        const valueLen = trimmed.slice(eqIndex + 1).length
        return { type: 'env' as const, keyLen, valueLen, id: i }
      }
      return { type: 'other' as const, text: line, id: i }
    })
  }, [envText])

  const handleSaveEnv = async () => {
    const env: Record<string, string> = {}
    envText.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (key) {
          env[key] = value
        }
      }
    })

    await updateApp.mutateAsync({
      id: app.id,
      updates: { environmentVariables: env },
    })
    setSavedEnvText(envText)
    setEnvSaved(true)
    setTimeout(() => setEnvSaved(false), 2000)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('apps.environment.title')}
          </h4>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-500">({t('apps.environment.unsavedChanges')})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setMasked(!masked)}
            >
              <HugeiconsIcon icon={masked ? ViewOffIcon : EyeIcon} size={14} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent>
              {masked ? t('apps.environment.showValues') : t('apps.environment.hideValues')}
            </TooltipContent>
          </Tooltip>
          {hasUnsavedChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEnvText(savedEnvText)
                setEnvSaved(false)
              }}
            >
              {t('apps.cancel')}
            </Button>
          )}
          <Button size="sm" onClick={handleSaveEnv} disabled={updateApp.isPending || !hasUnsavedChanges}>
            {updateApp.isPending ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
                {t('status.saving')}
              </>
            ) : envSaved ? (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={14}
                  strokeWidth={2}
                  className="text-green-500"
                />
                {t('status.saved')}
              </>
            ) : (
              t('apps.environment.save')
            )}
          </Button>
        </div>
      </div>

      {masked ? (
        <div
          className="font-mono text-sm min-h-[120px] rounded-md border bg-background px-3 py-2 cursor-pointer"
          onClick={() => setMasked(false)}
        >
          {maskedLines.length === 0 || (maskedLines.length === 1 && maskedLines[0].type === 'empty') ? (
            <span className="text-muted-foreground">{t('apps.environment.placeholder')}</span>
          ) : (
            maskedLines.map((line) => (
              <div key={line.id} className="leading-6">
                {line.type === 'empty' ? (
                  <span>&nbsp;</span>
                ) : line.type === 'comment' || line.type === 'other' ? (
                  <span className="text-muted-foreground">{line.text}</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--chart-1)' }}>{'•'.repeat(line.keyLen)}</span>
                    <span style={{ color: 'var(--chart-3)' }}>•</span>
                    <span style={{ color: 'var(--chart-2)' }}>{'•'.repeat(line.valueLen)}</span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <Textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={t('apps.environment.placeholder')}
          className="font-mono text-sm min-h-[120px]"
        />
      )}
    </div>
  )
}
