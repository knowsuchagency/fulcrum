import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useOpencodeModel as useOpencodeModelSetting } from '@/hooks/use-config'
import { CLAUDE_MODEL_OPTIONS, type ClaudeModelId } from '@/stores/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

/**
 * AI Chat Assistant - A floating chat widget for interacting with Claude
 * Provides access to Fulcrum's MCP tools for task management, git operations, and more.
 */
export const AiChatAssistant = observer(function AiChatAssistant() {
  const { t } = useTranslation('assistant')
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

  // Fetch OpenCode models and default from settings
  const { providers: opencodeProviders, installed: opencodeInstalled } = useOpencodeModels()
  const { data: defaultOpencodeModel } = useOpencodeModelSetting()

  // Initialize OpenCode model from settings when switching to opencode and no model is selected
  useEffect(() => {
    if (provider === 'opencode' && !opencodeModel && defaultOpencodeModel) {
      setOpencodeModel(defaultOpencodeModel)
    }
  }, [provider, opencodeModel, defaultOpencodeModel, setOpencodeModel])

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
      return currentClaudeModel?.label || t('models.opus')
    }
    if (opencodeModel) {
      // Show just the model name, not the full provider/model path
      const parts = opencodeModel.split('/')
      return parts.length > 1 ? parts[1] : opencodeModel
    }
    return t('models.selectModel')
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
    <>
      {/* Floating 3D Glowing AI Logo - hidden on mobile, shown in header instead */}
      <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
        <button
          className={`floating-ai-button relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 transform ${
            isOpen ? 'rotate-90' : 'rotate-0'
          } hover:scale-110`}
          onClick={toggle}
          style={{
            cursor: 'pointer',
            background: isDark
              ? 'linear-gradient(135deg, var(--destructive) 0%, color-mix(in oklch, var(--destructive) 80%, black) 100%)'
              : 'linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 80%, black) 100%)',
            boxShadow: isDark
              ? '0 0 20px color-mix(in oklch, var(--destructive) 50%, transparent), 0 0 40px color-mix(in oklch, var(--destructive) 30%, transparent)'
              : '0 0 20px color-mix(in oklch, var(--accent) 50%, transparent), 0 0 40px color-mix(in oklch, var(--accent) 30%, transparent)',
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
          <div className={`absolute inset-0 rounded-full animate-pulse opacity-30 ${isDark ? 'bg-destructive' : 'bg-accent'}`} />
          {!isOpen && <div className={`absolute -inset-1 rounded-full animate-ping opacity-15 ${isDark ? 'bg-destructive' : 'bg-accent'}`} />}
        </button>
      </div>

      {/* Chat Interface */}
      {isOpen && (
        <div
          ref={chatRef}
          className="fixed bottom-6 right-6 sm:bottom-24 z-50 w-[420px] max-w-[calc(100vw-48px)] transition-all duration-300 origin-bottom-right"
          style={{
            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          }}
        >
          <div className="film-grain relative flex flex-col font-sans rounded-3xl shadow-2xl overflow-hidden max-h-[min(600px,calc(100vh-140px))] bg-popover border border-border" style={{ background: 'var(--gradient-card)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">{t('title')}</span>
                <Tooltip>
                  <TooltipTrigger className="flex items-center">
                    <Badge variant="destructive" className="text-[0.55rem] h-3.5 px-1 cursor-help leading-none border border-destructive/30">
                      {t('preview.badge')}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    {t('preview.tooltip')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                {/* Provider Toggle */}
                {isOpencodeAvailable && (
                  <div className="flex items-center rounded-full p-0.5 bg-muted/60">
                    <button
                      onClick={() => setProvider('claude')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all ${
                        provider === 'claude'
                          ? 'bg-accent/20 text-accent'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('providers.claude')}
                    </button>
                    <button
                      onClick={() => setProvider('opencode')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all ${
                        provider === 'opencode'
                          ? 'bg-accent/20 text-accent'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('providers.opencode')}
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
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-2xl transition-colors bg-muted/60 text-foreground hover:bg-muted"
                  >
                    <span className="max-w-[80px] truncate">{getModelLabel()}</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Model Dropdown */}
                  {isDropdownOpen && (
                    <div className="absolute top-full right-0 mt-1 w-48 max-h-64 overflow-y-auto rounded-xl shadow-xl backdrop-blur-sm z-10 animate-in fade-in-0 slide-in-from-top-1 duration-150 scrollbar-thin bg-popover/95 border border-border scrollbar-thumb-muted">
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
                              className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between hover:bg-muted/50 ${
                                model === option.id
                                  ? 'bg-accent/10 text-accent'
                                  : 'text-foreground'
                              }`}
                            >
                              <div>
                                <div className="font-medium text-xs">{option.label}</div>
                                <div className="text-[10px] text-muted-foreground">{option.description}</div>
                              </div>
                              {model === option.id && (
                                <Check className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
                              )}
                            </button>
                          ))}
                        </>
                      )}

                      {/* OpenCode Models */}
                      {provider === 'opencode' && (
                        <>
                          {/* Filter Input */}
                          <div className="sticky top-0 p-2 bg-popover/95">
                            <input
                              ref={filterInputRef}
                              type="text"
                              value={modelFilter}
                              onChange={(e) => setModelFilter(e.target.value)}
                              placeholder={t('models.filterModels')}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none transition-colors bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {sortedOpencodeProviders.length === 0 && modelFilter && (
                            <div className="px-3 py-4 text-xs text-center text-muted-foreground">
                              {t('models.noModelsMatch', { filter: modelFilter })}
                            </div>
                          )}
                          {sortedOpencodeProviders.map(([providerName, models]) => (
                            <div key={providerName}>
                              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50">
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
                                    className={`w-full px-3 py-1.5 text-left transition-colors flex items-center justify-between hover:bg-muted/50 ${
                                      isSelected
                                        ? 'bg-accent/10 text-accent'
                                        : 'text-foreground'
                                    }`}
                                  >
                                    <span className="text-xs truncate">{modelName}</span>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 flex-shrink-0 ml-2 text-accent" />
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
                    className="p-1.5 rounded-full transition-colors hover:bg-muted"
                    title={t('header.clearConversation')}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-1.5 rounded-full transition-colors hover:bg-muted"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Messages */}
            {messages.length > 0 && (
              <div
                ref={scrollRef}
                className="overflow-y-auto px-4 py-2 max-h-[350px] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted"
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
            <ChatInput onSend={handleSend} isLoading={isStreaming} />

            {/* Footer Info - hidden on mobile */}
            <div className="hidden sm:flex items-center justify-between px-4 pb-3 pt-1 text-xs gap-4 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Info className="w-3 h-3" />
                <span>
                  {t('input.shiftEnterHint').split('<kbd>').map((part, i) => {
                    if (i === 0) return part
                    const [kbd, rest] = part.split('</kbd>')
                    return (
                      <span key={i}>
                        <kbd className="px-1.5 py-0.5 rounded font-mono text-xs shadow-sm bg-muted border border-border text-muted-foreground">
                          {kbd}
                        </kbd>
                        {rest}
                      </span>
                    )
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span>{t('header.connected')}</span>
              </div>
            </div>

            {/* Floating Overlay (dark mode only) */}
            {isDark && (
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in oklch, var(--destructive) 3%, transparent), transparent, color-mix(in oklch, var(--accent) 3%, transparent))',
                }}
              />
            )}
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
        <DialogContent className="sm:max-w-2xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-accent/20 border border-accent/40">
                <Bot className="w-3.5 h-3.5 text-accent" />
              </div>
              {t('header.aiAssistantResponse')}
            </DialogTitle>
          </DialogHeader>
          {expandedMessage && (
            <div
              data-color-mode={isDark ? 'dark' : 'light'}
              className="mt-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted"
            >
              <MarkdownPreview
                source={expandedMessage.content}
                style={{
                  backgroundColor: 'transparent',
                  fontSize: '14px',
                  lineHeight: '1.7',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-sans)',
                }}
                components={markdownComponents}
                className="prose max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_code]:text-accent [&_a]:text-accent [&_a:hover]:text-accent/80 [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:text-foreground [&_table]:border-border [&_th]:bg-muted [&_th]:border-border [&_th]:text-foreground [&_td]:border-border [&_td]:text-foreground"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
})
