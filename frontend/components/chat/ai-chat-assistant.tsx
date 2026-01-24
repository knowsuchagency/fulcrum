import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Bot, X, Trash2, Info, ChevronDown } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { useChat } from '@/hooks/use-chat'
import { usePageContext } from '@/hooks/use-page-context'
import { MODEL_OPTIONS } from '@/stores/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * AI Chat Assistant - A floating chat widget for interacting with Claude
 * Provides access to Fulcrum's MCP tools for task management, git operations, and more.
 */
export const AiChatAssistant = observer(function AiChatAssistant() {
  const {
    isOpen,
    isStreaming,
    messages,
    hasMessages,
    error,
    model,
    toggle,
    close,
    sendMessage,
    clearMessages,
    setModel,
  } = useChat()

  const pageContext = usePageContext()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const scrollRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const [isModelOpen, setIsModelOpen] = useState(false)
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null)
  const wasStreamingRef = useRef(false)

  const expandedMessage = useMemo(
    () => messages.find((m) => m.id === expandedMessageId),
    [messages, expandedMessageId]
  )

  // Custom components for expanded markdown
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
    }),
    []
  )

  // Invalidate queries when chat streaming completes (AI may have modified data)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      // Streaming just finished - invalidate common data queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-dependencies'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, queryClient])

  // Auto-scroll to bottom when new messages arrive
  const lastMessageContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, lastMessageContent])

  // Keyboard shortcut to toggle chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        toggle()
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle, close, isOpen])

  // Close chat when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        // Check if the click is not on the floating button
        if (!(event.target as Element).closest('.floating-ai-button')) {
          close()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, close])

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

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message, pageContext)
    },
    [sendMessage, pageContext]
  )

  const currentModel = MODEL_OPTIONS.find((m) => m.id === model)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating 3D Glowing AI Logo */}
      <button
        className={`floating-ai-button relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 transform ${
          isOpen ? 'rotate-90' : 'rotate-0'
        } hover:scale-110`}
        onClick={toggle}
        style={{
          cursor: 'pointer',
          background: isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.8) 0%, rgba(168,85,247,0.8) 100%)'
            : 'linear-gradient(135deg, rgba(13,92,99,0.9) 0%, rgba(11,122,117,0.9) 100%)',
          boxShadow: isDark
            ? '0 0 20px rgba(139, 92, 246, 0.7), 0 0 40px rgba(124, 58, 237, 0.5), 0 0 60px rgba(109, 40, 217, 0.3)'
            : '0 0 20px rgba(13, 92, 99, 0.6), 0 0 40px rgba(11, 122, 117, 0.4), 0 0 60px rgba(13, 92, 99, 0.2)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* 3D effect */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30" />

        {/* Inner glow */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />

        {/* AI Icon */}
        <div className="relative z-10">
          {isOpen ? <X className="w-7 h-7 text-white" /> : <Bot className="w-8 h-8 text-white" />}
        </div>

        {/* Breathing glow animation */}
        <div className={`absolute inset-0 rounded-full animate-pulse opacity-30 ${isDark ? 'bg-indigo-500' : 'bg-teal-600'}`} />
        {!isOpen && <div className={`absolute -inset-1 rounded-full animate-ping opacity-15 ${isDark ? 'bg-indigo-400' : 'bg-teal-500'}`} />}
      </button>

      {/* Chat Interface */}
      {isOpen && (
        <div
          ref={chatRef}
          className="absolute bottom-20 right-0 w-[420px] max-w-[calc(100vw-48px)] transition-all duration-300 origin-bottom-right"
          style={{
            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          }}
        >
          <div className={`relative flex flex-col rounded-3xl shadow-2xl backdrop-blur-3xl overflow-hidden max-h-[min(600px,calc(100vh-140px))] ${
            isDark
              ? 'bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 border border-zinc-500/50'
              : 'bg-gradient-to-br from-white/95 to-zinc-50/95 border border-zinc-200'
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>AI Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <div ref={modelRef} className="relative">
                  <button
                    onClick={() => setIsModelOpen(!isModelOpen)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-2xl transition-colors ${
                      isDark
                        ? 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    <span>{currentModel?.label}</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${isModelOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Model Dropdown */}
                  {isModelOpen && (
                    <div className={`absolute top-full right-0 mt-1 w-40 rounded-xl shadow-xl backdrop-blur-sm overflow-hidden z-10 animate-in fade-in-0 slide-in-from-top-1 duration-150 ${
                      isDark
                        ? 'bg-zinc-900/95 border border-zinc-700/50'
                        : 'bg-white/95 border border-zinc-200'
                    }`}>
                      {MODEL_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => {
                            setModel(option.id)
                            setIsModelOpen(false)
                          }}
                          className={`w-full px-3 py-2 text-left transition-colors ${
                            isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
                          } ${
                            model === option.id
                              ? isDark ? 'bg-red-500/10 text-red-400' : 'bg-teal-500/10 text-teal-600'
                              : isDark ? 'text-zinc-300' : 'text-zinc-700'
                          }`}
                        >
                          <div className="font-medium text-xs">{option.label}</div>
                          <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{option.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {hasMessages && (
                  <button
                    onClick={clearMessages}
                    className={`p-1.5 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-200'}`}
                    title="Clear conversation"
                  >
                    <Trash2 className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
                  </button>
                )}
                <button
                  onClick={close}
                  className={`p-1.5 rounded-full transition-colors ${isDark ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-200'}`}
                >
                  <X className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
                </button>
              </div>
            </div>

            {/* Messages */}
            {messages.length > 0 && (
              <div
                ref={scrollRef}
                className={`overflow-y-auto px-4 py-2 max-h-[350px] scrollbar-thin scrollbar-track-transparent ${
                  isDark ? 'scrollbar-thumb-zinc-700' : 'scrollbar-thumb-zinc-300'
                }`}
              >
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as 'user' | 'assistant'}
                  content={msg.content}
                  isStreaming={msg.isStreaming}
                  onClick={msg.role === 'assistant' ? () => setExpandedMessageId(msg.id) : undefined}
                />
              ))}

              {/* Error display */}
              {error && (
                <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              </div>
            )}

            {/* Error display when no messages */}
            {messages.length === 0 && error && (
              <div className="mx-4 my-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Input Section */}
            <ChatInput onSend={handleSend} isLoading={isStreaming} isDark={isDark} />

            {/* Footer Info */}
            <div className={`flex items-center justify-between px-4 pb-3 pt-1 text-xs gap-4 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <div className="flex items-center gap-2">
                <Info className="w-3 h-3" />
                <span>
                  Press{' '}
                  <kbd className={`px-1.5 py-0.5 rounded font-mono text-xs shadow-sm ${
                    isDark
                      ? 'bg-zinc-800 border border-zinc-600 text-zinc-400'
                      : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                  }`}>
                    Shift + Enter
                  </kbd>{' '}
                  for new line
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>Connected</span>
              </div>
            </div>

            {/* Floating Overlay */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: isDark
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), transparent, rgba(147, 51, 234, 0.05))'
                  : 'linear-gradient(135deg, rgba(13, 92, 99, 0.04), transparent 40%, rgba(11, 122, 117, 0.03))',
              }}
            />
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes popIn {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .floating-ai-button,
        .floating-ai-button * {
          cursor: pointer !important;
        }

        .floating-ai-button:hover {
          box-shadow: 0 0 30px color-mix(in srgb, var(--gradient-glow) 90%, transparent),
                      0 0 50px color-mix(in srgb, var(--gradient-glow) 70%, transparent),
                      0 0 70px color-mix(in srgb, var(--gradient-glow) 50%, transparent);
        }
      `}</style>

      {/* Expanded Message Modal */}
      <Dialog open={!!expandedMessageId} onOpenChange={(open) => !open && setExpandedMessageId(null)}>
        <DialogContent
          className={`sm:max-w-2xl lg:max-w-4xl ${
            isDark
              ? 'bg-zinc-900 border-zinc-700'
              : 'bg-white border-zinc-200'
          }`}
        >
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-zinc-800'}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  isDark
                    ? 'bg-gradient-to-br from-red-500/30 to-orange-500/30 border border-red-500/40'
                    : 'bg-gradient-to-br from-teal-500/30 to-teal-400/30 border border-teal-500/40'
                }`}
              >
                <Bot className={`w-3.5 h-3.5 ${isDark ? 'text-red-300' : 'text-teal-600'}`} />
              </div>
              AI Assistant Response
            </DialogTitle>
          </DialogHeader>
          {expandedMessage && (
            <div
              data-color-mode={isDark ? 'dark' : 'light'}
              className={`mt-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent ${
                isDark ? 'scrollbar-thumb-zinc-700' : 'scrollbar-thumb-zinc-300'
              }`}
            >
              <MarkdownPreview
                source={expandedMessage.content}
                style={{
                  backgroundColor: 'transparent',
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: isDark ? '#e4e4e7' : '#3f3f46',
                }}
                components={markdownComponents}
                className={`prose max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto ${
                  isDark
                    ? '[&_pre]:bg-zinc-800 [&_pre]:border [&_pre]:border-zinc-700 [&_code]:text-red-300 [&_a]:text-red-400 [&_a:hover]:text-red-300 [&_strong]:text-zinc-100 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-100 [&_h4]:text-zinc-100 [&_li]:text-zinc-200 [&_table]:border-zinc-700 [&_th]:bg-zinc-800 [&_th]:border-zinc-700 [&_th]:text-zinc-100 [&_td]:border-zinc-700 [&_td]:text-zinc-200'
                    : '[&_pre]:bg-zinc-100 [&_pre]:border [&_pre]:border-zinc-200 [&_code]:text-teal-700 [&_a]:text-teal-600 [&_a:hover]:text-teal-700 [&_strong]:text-zinc-800 [&_h1]:text-zinc-800 [&_h2]:text-zinc-800 [&_h3]:text-zinc-800 [&_h4]:text-zinc-800 [&_li]:text-zinc-700 [&_table]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:border-zinc-200 [&_th]:text-zinc-800 [&_td]:border-zinc-200 [&_td]:text-zinc-700'
                }`}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
})
