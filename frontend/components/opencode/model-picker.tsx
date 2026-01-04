import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxEmpty,
  ComboboxSeparator,
} from '@/components/ui/combobox'
import { useOpencodeModels } from '@/hooks/use-opencode-models'

interface ModelPickerProps {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  showUseDefault?: boolean
  className?: string
}

/**
 * Model picker for OpenCode.
 * Shows available models grouped by provider.
 */
export function ModelPicker({
  value,
  onChange,
  placeholder,
  showUseDefault = true,
  className,
}: ModelPickerProps) {
  const { t } = useTranslation('common')
  const { providers, installed, isLoading, isError } = useOpencodeModels()

  // Sort providers alphabetically
  const sortedProviders = useMemo(() => {
    return Object.entries(providers).sort(([a], [b]) => a.localeCompare(b))
  }, [providers])

  // Get display label for the selected value
  const getDisplayLabel = (val: string | null): string => {
    if (!val) return ''
    return val
  }

  if (isLoading) {
    return (
      <div className={`text-muted-foreground text-sm ${className}`}>
        {t('status.loading')}
      </div>
    )
  }

  if (isError || !installed) {
    return (
      <div className={`text-muted-foreground text-sm ${className}`}>
        {t('opencode.notInstalled', 'OpenCode not installed')}
      </div>
    )
  }

  return (
    <div className={className}>
      <Combobox
        value={value || ''}
        onValueChange={(val) => onChange(val === '' ? null : (val as string))}
        itemToStringLabel={getDisplayLabel}
      >
        <ComboboxInput
          placeholder={placeholder || t('opencode.selectModel', 'Select model')}
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxEmpty>
              {t('opencode.noModelsFound', 'No models found')}
            </ComboboxEmpty>

            {showUseDefault && (
              <>
                <ComboboxItem value="">
                  <span className="text-muted-foreground">
                    {t('opencode.useDefault', 'Use default')}
                  </span>
                </ComboboxItem>
                {sortedProviders.length > 0 && <ComboboxSeparator />}
              </>
            )}

            {sortedProviders.map(([provider, models], index) => (
              <ComboboxGroup key={provider}>
                <ComboboxLabel>{provider}</ComboboxLabel>
                {models.map((model) => (
                  <ComboboxItem
                    key={`${provider}/${model}`}
                    value={`${provider}/${model}`}
                  >
                    <span className="pl-2">{model}</span>
                  </ComboboxItem>
                ))}
                {index < sortedProviders.length - 1 && <ComboboxSeparator />}
              </ComboboxGroup>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
