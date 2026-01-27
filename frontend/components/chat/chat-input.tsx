import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Paperclip, X, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ImageAttachment {
  id: string
  file: File
  dataUrl: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

interface ChatInputProps {
  onSend: (message: string, images?: ImageAttachment[]) => void
  isLoading?: boolean
  placeholder?: string
  onCancel?: () => void
}

export interface ChatInputHandle {
  focus: () => void
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { onSend, isLoading, placeholder, onCancel },
  ref
) {
  const { t } = useTranslation('assistant')
  const finalPlaceholder = placeholder ?? t('input.placeholder')
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus()
    },
  }))

  // Handle file selection
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return

    const newImages: ImageAttachment[] = []

    for (const file of Array.from(files)) {
      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
        continue
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        continue
      }

      // Read as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      newImages.push({
        id: crypto.randomUUID(),
        file,
        dataUrl,
        mediaType: file.type as ImageAttachment['mediaType'],
      })
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages])
    }
  }, [])

  // Handle paste event
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            imageFiles.push(file)
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        const fileList = new DataTransfer()
        imageFiles.forEach((f) => fileList.items.add(f))
        await handleFiles(fileList.files)
      }
    },
    [handleFiles]
  )

  // Remove an image
  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    const hasContent = trimmed || images.length > 0
    if (hasContent && !isLoading) {
      onSend(trimmed, images.length > 0 ? images : undefined)
      setValue('')
      setImages([])
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [value, images, isLoading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const hasContent = value.trim() || images.length > 0

  return (
    <div className="relative">
      {/* Image Previews */}
      {images.length > 0 && (
        <div className="px-4 pt-4 flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.dataUrl}
                alt="Attachment"
                className="h-16 w-16 object-cover rounded-lg border border-border"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="relative overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={3}
          disabled={isLoading}
          className="w-full px-6 py-4 bg-transparent border-none outline-none resize-none text-base font-sans font-normal leading-relaxed min-h-[100px] disabled:opacity-50 text-foreground placeholder-muted-foreground caret-current"
          placeholder={finalPlaceholder}
          style={{ scrollbarWidth: 'none' }}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Controls Section */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between">
          {/* Attach Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Attach image"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Send/Stop Button */}
          {isLoading && onCancel ? (
            <button
              onClick={onCancel}
              className="group relative p-3 border-none rounded-lg cursor-pointer transition-all duration-300 shadow-lg hover:scale-105 hover:shadow-xl active:scale-95 transform bg-destructive text-destructive-foreground hover:bg-destructive/90"
              style={{
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 0 color-mix(in oklch, var(--destructive) 30%, transparent)',
              }}
              title="Stop generating"
            >
              <Square className="w-5 h-5 fill-current" />

              {/* Animated background glow */}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110 bg-destructive" />

              {/* Ripple effect on click */}
              <div className="absolute inset-0 rounded-lg overflow-hidden">
                <div className="absolute inset-0 bg-white/20 transform scale-0 group-active:scale-100 transition-transform duration-200 rounded-lg" />
              </div>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!hasContent || isLoading}
              className="group relative p-3 border-none rounded-lg cursor-pointer transition-all duration-300 shadow-lg hover:scale-105 hover:shadow-xl active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg bg-accent text-accent-foreground hover:bg-accent/90"
              style={{
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 0 color-mix(in oklch, var(--accent) 30%, transparent)',
              }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:rotate-12" />
              )}

              {/* Animated background glow */}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110 bg-accent" />

              {/* Ripple effect on click */}
              <div className="absolute inset-0 rounded-lg overflow-hidden">
                <div className="absolute inset-0 bg-white/20 transform scale-0 group-active:scale-100 transition-transform duration-200 rounded-lg" />
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
