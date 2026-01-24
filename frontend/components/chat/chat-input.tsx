import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, ChevronDown, Loader2 } from 'lucide-react'
import { MODEL_OPTIONS, type ModelId } from '@/stores/chat-store'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading?: boolean
  placeholder?: string
  model: ModelId
  onModelChange: (model: ModelId) => void
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder = 'What would you like to explore today? Ask anything...',
  model,
  onModelChange,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [isModelOpen, setIsModelOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const maxChars = 2000

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

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setIsModelOpen(false)
      }
    }

    if (isModelOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isModelOpen])

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

  const currentModel = MODEL_OPTIONS.find((m) => m.id === model)

  return (
    <div className="relative">
      {/* Textarea */}
      <div className="relative overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxChars))}
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
        <div className="flex items-center justify-between">
          {/* Model Selector */}
          <div ref={modelRef} className="relative">
            <button
              onClick={() => setIsModelOpen(!isModelOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 rounded-xl border border-zinc-700/50 text-sm text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              <span>{currentModel?.label}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isModelOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Model Dropdown */}
            {isModelOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-900/95 border border-zinc-700/50 rounded-xl shadow-xl backdrop-blur-sm overflow-hidden z-10">
                {MODEL_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      onModelChange(option.id)
                      setIsModelOpen(false)
                    }}
                    className={`w-full px-4 py-2.5 text-left hover:bg-zinc-800/50 transition-colors ${
                      model === option.id ? 'bg-red-500/10 text-red-400' : 'text-zinc-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-zinc-500">{option.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Character Counter */}
            <div className="text-xs font-medium text-zinc-500">
              <span className={value.length > maxChars * 0.9 ? 'text-amber-400' : ''}>
                {value.length}
              </span>
              /<span className="text-zinc-400">{maxChars}</span>
            </div>

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
    </div>
  )
}
