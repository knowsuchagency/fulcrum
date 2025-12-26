import { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { useBrowserUrl } from '@/hooks/use-browser-url'

interface BrowserPreviewProps {
  taskId: string
}

export function BrowserPreview({ taskId }: BrowserPreviewProps) {
  const { url, setUrl } = useBrowserUrl(taskId)
  const [inputValue, setInputValue] = useState(url)
  const [key, setKey] = useState(0)

  // Sync input value when URL changes (e.g., on initial load)
  useEffect(() => {
    setInputValue(url)
  }, [url])

  const handleRefresh = useCallback(() => {
    setKey((k) => k + 1)
  }, [])

  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      let newUrl = inputValue.trim()
      if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
        newUrl = `http://${newUrl}`
      }
      setUrl(newUrl)
      setKey((k) => k + 1)
    },
    [inputValue, setUrl]
  )

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Browser toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <Button variant="ghost" size="icon-xs" disabled>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </Button>
        <Button variant="ghost" size="icon-xs" disabled>
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={handleRefresh}>
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
        </Button>

        <form onSubmit={handleNavigate} className="flex-1">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="h-7 bg-background text-xs"
            placeholder="Enter URL..."
          />
        </form>
      </div>

      {/* Browser content */}
      <div className="flex-1 overflow-hidden bg-white">
        <iframe
          key={key}
          src={url}
          className="h-full w-full border-0"
          title="Browser Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  )
}
