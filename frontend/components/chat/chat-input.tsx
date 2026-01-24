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
          className="w-full px-6 py-4 bg-transparent border-none outline-none resize-none text-base font-normal leading-relaxed min-h-[100px] text-zinc-100 placeholder-zinc-500 disabled:opacity-50"
          placeholder={placeholder}
          style={{ scrollbarWidth: 'none' }}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-zinc-800/5 to-transparent pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(39, 39, 42, 0.05), transparent)' }}
        />
      </div>

      {/* Controls Section */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-end">
          {/* Send Button */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="group relative p-3 bg-gradient-to-r from-red-600 to-red-500 border-none rounded-xl cursor-pointer transition-all duration-300 text-white shadow-lg hover:from-red-500 hover:to-red-400 hover:scale-105 hover:shadow-red-500/30 hover:shadow-xl active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
            style={{
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(239, 68, 68, 0.4)',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:rotate-12" />
            )}

            {/* Animated background glow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-600 to-red-500 opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110" />

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
