import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { highlightCode, getLangFromPath, type ShikiTheme } from '@/lib/shiki'
import { cn } from '@/lib/utils'
import type { FileContent as FileContentType } from '@/types'
import { useTheme } from 'next-themes'

interface FileContentProps {
  filePath: string | null
  content: FileContentType | null
  isLoading: boolean
  error: Error | null
  onClose: () => void
}

export function FileContent({
  filePath,
  content,
  isLoading,
  error,
  onClose,
}: FileContentProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [isHighlighting, setIsHighlighting] = useState(false)
  const [wrap, setWrap] = useState(true)
  const { resolvedTheme } = useTheme()
  const shikiTheme: ShikiTheme = resolvedTheme === 'light' ? 'light' : 'dark'

  useEffect(() => {
    if (!content || !filePath) {
      setHighlightedHtml(null)
      return
    }

    // Skip highlighting for images and binary files
    if (
      content.mimeType.startsWith('image/') ||
      content.mimeType === 'application/octet-stream'
    ) {
      setHighlightedHtml(null)
      return
    }

    // Highlight the code
    setIsHighlighting(true)
    const lang = getLangFromPath(filePath)

    highlightCode(content.content, lang, shikiTheme)
      .then((html) => {
        setHighlightedHtml(html)
        setIsHighlighting(false)
      })
      .catch(() => {
        setHighlightedHtml(null)
        setIsHighlighting(false)
      })
  }, [content, filePath, shikiTheme])

  // No file selected
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select a file to view
      </div>
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading file...
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        {error.message}
      </div>
    )
  }

  // No content
  if (!content) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Unable to load file
      </div>
    )
  }

  // Binary file
  if (content.mimeType === 'application/octet-stream') {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground text-sm gap-2">
        <p>Binary file</p>
        <p className="text-xs">
          {(content.size / 1024).toFixed(1)} KB
        </p>
      </div>
    )
  }

  // Image file
  if (content.mimeType.startsWith('image/')) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <div className="flex shrink-0 items-center justify-between px-2 py-1.5 bg-card border-b border-border text-xs">
          <span className="text-muted-foreground truncate" title={filePath}>
            {filePath.split('/').pop() || filePath}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
            title="Close file"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 bg-muted">
          <img
            src={content.content}
            alt={filePath}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    )
  }

  // Text/code file
  const fileName = filePath.split('/').pop() || filePath

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 px-2 py-1.5 bg-card border-b border-border text-xs">
        <span className="text-muted-foreground truncate flex-1" title={filePath}>
          {fileName}
        </span>
        {content.truncated && (
          <span className="text-destructive">
            Truncated ({content.lineCount.toLocaleString()} lines)
          </span>
        )}
        <span className="text-muted-foreground">
          {(content.size / 1024).toFixed(1)} KB
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
            className="w-3 h-3"
          />
          Wrap
        </label>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
          title="Close file"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {isHighlighting ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Highlighting...
          </div>
        ) : highlightedHtml ? (
          <div
            className={cn(
              'text-xs [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-2 [&_code]:!bg-transparent',
              wrap
                ? '[&_pre]:whitespace-pre-wrap [&_pre]:break-all'
                : '[&_pre]:whitespace-pre'
            )}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre
            className={cn(
              'p-2 font-mono text-xs',
              wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
            )}
          >
            {content.content}
          </pre>
        )}
      </ScrollArea>
    </div>
  )
}
