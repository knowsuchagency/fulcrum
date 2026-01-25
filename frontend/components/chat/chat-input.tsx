import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Manage tasks, projects, run commands, deploy apps... Ask anything!',
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (trimmed && !isLoading) {
      onSend(trimmed)
      setValue('')
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [value, isLoading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="relative">
      {/* Textarea */}
      <div className="relative overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={isLoading}
          className="w-full px-6 py-4 bg-transparent border-none outline-none resize-none text-base font-sans font-normal leading-relaxed min-h-[100px] disabled:opacity-50 text-foreground placeholder-muted-foreground"
          placeholder={placeholder}
          style={{ scrollbarWidth: 'none' }}
        />
      </div>

      {/* Controls Section */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-end">
          {/* Send Button */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="group relative p-3 border-none rounded-xl cursor-pointer transition-all duration-300 shadow-lg hover:scale-105 hover:shadow-xl active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg bg-accent text-accent-foreground hover:bg-accent/90"
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
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110 bg-accent" />

            {/* Ripple effect on click */}
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-white/20 transform scale-0 group-active:scale-100 transition-transform duration-200 rounded-xl" />
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
