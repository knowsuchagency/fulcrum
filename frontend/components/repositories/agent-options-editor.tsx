import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'

interface AgentOptionsEditorProps {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

interface OptionRow {
  id: string
  key: string
  value: string
}

export function AgentOptionsEditor({ value, onChange }: AgentOptionsEditorProps) {
  const { t } = useTranslation('repositories')

  // Convert object to rows for editing
  const [rows, setRows] = useState<OptionRow[]>(() => {
    const entries = Object.entries(value)
    if (entries.length === 0) return []
    return entries.map(([key, val]) => ({
      id: crypto.randomUUID(),
      key,
      value: val,
    }))
  })

  const newKeyInputRef = useRef<HTMLInputElement>(null)

  // Sync external value changes
  useEffect(() => {
    const entries = Object.entries(value)
    if (entries.length === 0 && rows.length === 0) return
    // Only sync if the external value is meaningfully different
    const currentObj = rowsToObject(rows)
    if (JSON.stringify(currentObj) !== JSON.stringify(value)) {
      setRows(
        entries.map(([key, val]) => ({
          id: crypto.randomUUID(),
          key,
          value: val,
        }))
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Convert rows back to object, filtering empty keys
  const rowsToObject = (r: OptionRow[]): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const row of r) {
      const key = row.key.trim()
      if (key) {
        result[key] = row.value
      }
    }
    return result
  }

  const handleRowChange = (id: string, field: 'key' | 'value', newValue: string) => {
    const updated = rows.map((row) =>
      row.id === id ? { ...row, [field]: newValue } : row
    )
    setRows(updated)
    onChange(rowsToObject(updated))
  }

  const handleAddRow = () => {
    const newRow: OptionRow = {
      id: crypto.randomUUID(),
      key: '',
      value: '',
    }
    setRows([...rows, newRow])
    // Focus the new key input after render
    setTimeout(() => {
      newKeyInputRef.current?.focus()
    }, 0)
  }

  const handleRemoveRow = (id: string) => {
    const updated = rows.filter((row) => row.id !== id)
    setRows(updated)
    onChange(rowsToObject(updated))
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[40%]">
                  {t('detailView.settings.agentOptionsFlag')}
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {t('detailView.settings.agentOptionsValue')}
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-2 py-1">
                    <Input
                      ref={index === rows.length - 1 ? newKeyInputRef : undefined}
                      value={row.key}
                      onChange={(e) => handleRowChange(row.id, 'key', e.target.value)}
                      placeholder="model"
                      className="h-8 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={row.value}
                      onChange={(e) => handleRowChange(row.id, 'value', e.target.value)}
                      placeholder="haiku"
                      className="h-8 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveRow(row.id)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleAddRow}
        className="w-full"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} data-slot="icon" />
        {t('detailView.settings.addAgentOption')}
      </Button>
    </div>
  )
}
