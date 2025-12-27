import { useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { uploadImage } from '@/lib/upload'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'

interface DescriptionTextareaProps
  extends Omit<React.ComponentProps<'textarea'>, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
}

// Extract image paths from description text
function extractImagePaths(text: string): string[] {
  // Match absolute paths ending in common image extensions
  const pathRegex = /\/[\w\-/.]+\.(png|jpg|jpeg|gif|webp|svg)/gi
  return [...(text.match(pathRegex) || [])]
}

// Convert absolute path to API URL
function pathToUrl(path: string): string {
  const filename = path.split('/').pop()
  return `/api/uploads/${filename}`
}

export function DescriptionTextarea({
  value,
  onValueChange,
  className,
  disabled,
  ...props
}: DescriptionTextareaProps) {
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const imagePaths = extractImagePaths(value)

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return

        setIsUploading(true)
        try {
          const path = await uploadImage(file)
          // Insert path at cursor position or append
          const textarea = textareaRef.current
          if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const before = value.slice(0, start)
            const after = value.slice(end)
            // Add newlines if not at start/end of content
            const prefix = before && !before.endsWith('\n') ? '\n' : ''
            const suffix = after && !after.startsWith('\n') ? '\n' : ''
            const newValue = before + prefix + path + suffix + after
            onValueChange(newValue)
          } else {
            onValueChange(value + (value ? '\n' : '') + path)
          }
        } catch (error) {
          toast.error('Failed to upload image')
          log.kanban.error('Upload error', { error: String(error) })
        } finally {
          setIsUploading(false)
        }
        return
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onPaste={handlePaste}
          className={cn(isUploading && 'opacity-50', className)}
          disabled={isUploading || disabled}
          {...props}
        />
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </div>
        )}
      </div>

      {imagePaths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imagePaths.map((path, idx) => (
            <a
              key={idx}
              href={pathToUrl(path)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={pathToUrl(path)}
                alt={`Attachment ${idx + 1}`}
                className="h-16 w-auto rounded border object-cover hover:opacity-80 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
