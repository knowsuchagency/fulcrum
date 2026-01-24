import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { Bot, X, Trash2, Info, ChevronDown, Check } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { useChat } from '@/hooks/use-chat'
import { usePageContext } from '@/hooks/use-page-context'
import { useOpencodeModels } from '@/hooks/use-opencode-models'
import { CLAUDE_MODEL_OPTIONS, type ClaudeModelId } from '@/stores/chat-store'
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
    provider,
    model,
    opencodeModel,
    toggle,
    close,
    sendMessage,
    clearMessages,
    setProvider,
    setModel,
    setOpencodeModel,
  } = useChat()

  const pageContext = usePageContext()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const scrollRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null)
  const [modelFilter, setModelFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  const wasStreamingRef = useRef(false)

  // Fetch OpenCode models
  const { providers: opencodeProviders, installed: opencodeInstalled } = useOpencodeModels()

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
      // Escape to close (but not if modal is open - let modal handle it first)
      if (e.key === 'Escape' && isOpen && !expandedMessageId) {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle, close, isOpen, expandedMessageId])

  // Close chat when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        // Check if the click is not on the floating button or the expanded message dialog
        const target = event.target as Element
        if (!target.closest('.floating-ai-button') && !target.closest('[data-slot="dialog-overlay"]') && !target.closest('[data-slot="dialog-content"]')) {
          close()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, close])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
        setModelFilter('')
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Focus filter input when dropdown opens for OpenCode
  useEffect(() => {
    if (isDropdownOpen && provider === 'opencode' && filterInputRef.current) {
      // Small delay to ensure the dropdown is rendered
      setTimeout(() => filterInputRef.current?.focus(), 50)
    }
  }, [isDropdownOpen, provider])

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message, pageContext)
    },
    [sendMessage, pageContext]
  )

  const currentClaudeModel = CLAUDE_MODEL_OPTIONS.find((m) => m.id === model)

  // Get current model display label
  const getModelLabel = () => {
    if (provider === 'claude') {
      return currentClaudeModel?.label || 'Opus'
    }
    if (opencodeModel) {
      // Show just the model name, not the full provider/model path
      const parts = opencodeModel.split('/')
      return parts.length > 1 ? parts[1] : opencodeModel
    }
    return 'Select model'
  }

  // Sort OpenCode providers alphabetically and filter by search term
  const sortedOpencodeProviders = useMemo(() => {
    const sorted = Object.entries(opencodeProviders).sort(([a], [b]) => a.localeCompare(b))
    if (!modelFilter.trim()) return sorted

    const filter = modelFilter.toLowerCase()
    return sorted
      .map(([providerName, models]) => {
        // Filter models that match the search
        const filteredModels = models.filter(
          (modelName) =>
            modelName.toLowerCase().includes(filter) ||
            providerName.toLowerCase().includes(filter)
        )
        return [providerName, filteredModels] as [string, string[]]
      })
      .filter(([, models]) => models.length > 0)
  }, [opencodeProviders, modelFilter])

  // Check if OpenCode is available (installed and has models)
  const isOpencodeAvailable = opencodeInstalled && sortedOpencodeProviders.length > 0

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
          <div className={`relative flex flex-col rounded-3xl shadow-2xl overflow-hidden max-h-[min(600px,calc(100vh-140px))] ${
            isDark
              ? 'bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-600'
              : 'bg-gradient-to-br from-white to-zinc-50 border border-zinc-200'
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>AI Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Provider Toggle */}
                {isOpencodeAvailable && (
                  <div className={`flex items-center rounded-full p-0.5 ${
                    isDark ? 'bg-zinc-800/60' : 'bg-zinc-100'
                  }`}>
                    <button
                      onClick={() => setProvider('claude')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all ${
                        provider === 'claude'
                          ? isDark
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-teal-500/20 text-teal-600'
                          : isDark
                            ? 'text-zinc-500 hover:text-zinc-300'
                            : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      Claude
                    </button>
                    <button
                      onClick={() => setProvider('opencode')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all ${
                        provider === 'opencode'
                          ? isDark
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-teal-500/20 text-teal-600'
                          : isDark
                            ? 'text-zinc-500 hover:text-zinc-300'
                            : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      OpenCode
                    </button>
                  </div>
                )}

                {/* Model Selector Dropdown */}
                <div ref={dropdownRef} className="relative">
                  <button
                    onClick={() => {
                      const newState = !isDropdownOpen
                      setIsDropdownOpen(newState)
                      if (!newState) setModelFilter('')
                    }}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-2xl transition-colors ${
                      isDark
                        ? 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    <span className="max-w-[80px] truncate">{getModelLabel()}</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Model Dropdown */}
                  {isDropdownOpen && (
                    <div className={`absolute top-full right-0 mt-1 w-48 max-h-64 overflow-y-auto rounded-xl shadow-xl backdrop-blur-sm z-10 animate-in fade-in-0 slide-in-from-top-1 duration-150 scrollbar-thin ${
                      isDark
                        ? 'bg-zinc-900/95 border border-zinc-700/50 scrollbar-thumb-zinc-700'
                        : 'bg-white/95 border border-zinc-200 scrollbar-thumb-zinc-300'
                    }`}>
                      {/* Claude Models */}
                      {provider === 'claude' && (
                        <>
                          {CLAUDE_MODEL_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                setModel(option.id as ClaudeModelId)
                                setIsDropdownOpen(false)
                              }}
                              className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between ${
                                isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
                              } ${
                                model === option.id
                                  ? isDark ? 'bg-red-500/10 text-red-400' : 'bg-teal-500/10 text-teal-600'
                                  : isDark ? 'text-zinc-300' : 'text-zinc-700'
                              }`}
                            >
                              <div>
                                <div className="font-medium text-xs">{option.label}</div>
                                <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{option.description}</div>
                              </div>
                              {model === option.id && (
                                <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-red-400' : 'text-teal-600'}`} />
                              )}
                            </button>
                          ))}
                        </>
                      )}

                      {/* OpenCode Models */}
                      {provider === 'opencode' && (
                        <>
                          {/* Filter Input */}
                          <div className={`sticky top-0 p-2 ${isDark ? 'bg-zinc-900/95' : 'bg-white/95'}`}>
                            <input
                              ref={filterInputRef}
                              type="text"
                              value={modelFilter}
                              onChange={(e) => setModelFilter(e.target.value)}
                              placeholder="Filter models..."
                              className={`w-full px-2.5 py-1.5 text-xs rounded-lg outline-none transition-colors ${
                                isDark
                                  ? 'bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600'
                                  : 'bg-zinc-100 border border-zinc-200 text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-300'
                              }`}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {sortedOpencodeProviders.length === 0 && modelFilter && (
                            <div className={`px-3 py-4 text-xs text-center ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              No models match "{modelFilter}"
                            </div>
                          )}
                          {sortedOpencodeProviders.map(([providerName, models]) => (
                            <div key={providerName}>
                              <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                                isDark ? 'text-zinc-500 bg-zinc-800/50' : 'text-zinc-400 bg-zinc-50'
                              }`}>
                                {providerName}
                              </div>
                              {models.map((modelName) => {
                                const fullModelId = `${providerName}/${modelName}`
                                const isSelected = opencodeModel === fullModelId
                                return (
                                  <button
                                    key={fullModelId}
                                    onClick={() => {
                                      setOpencodeModel(fullModelId)
                                      setIsDropdownOpen(false)
                                      setModelFilter('')
                                    }}
                                    className={`w-full px-3 py-1.5 text-left transition-colors flex items-center justify-between ${
                                      isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
                                    } ${
                                      isSelected
                                        ? isDark ? 'bg-red-500/10 text-red-400' : 'bg-teal-500/10 text-teal-600'
                                        : isDark ? 'text-zinc-300' : 'text-zinc-700'
                                    }`}
                                  >
                                    <span className="text-xs truncate">{modelName}</span>
                                    {isSelected && (
                                      <Check className={`w-3.5 h-3.5 flex-shrink-0 ml-2 ${isDark ? 'text-red-400' : 'text-teal-600'}`} />
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          ))}
                        </>
                      )}
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
