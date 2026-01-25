import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Bot, User, Send, Loader2, Plus, ChevronDown, Trash2, Check } from 'lucide-react'
import { useTheme } from 'next-themes'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { ChatSession, ChatMessage } from './types'
import { AGENT_DISPLAY_NAMES, type AgentType } from '../../../shared/types'

// Claude models for the AI assistant
const CLAUDE_MODELS = [
  { id: 'opus', label: 'Opus', description: 'Most capable' },
  { id: 'sonnet', label: 'Sonnet', description: 'Balanced' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest' },
] as const

type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id']

// Display names for Claude models
const CLAUDE_MODEL_NAMES: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
}

// Model Dropdown Component (supports both Claude and OpenCode)
function ModelDropdown({
  provider,
  model,
  opencodeModel,
  opencodeProviders,
  onModelChange,
  onOpencodeModelChange,
}: {
  provider: AgentType
  model: ClaudeModelId
  opencodeModel: string | null
  opencodeProviders: Record<string, string[]>
  onModelChange: (model: ClaudeModelId) => void
  onOpencodeModelChange: (model: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [modelFilter, setModelFilter] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setModelFilter('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus filter input when dropdown opens for OpenCode
  useEffect(() => {
    if (isOpen && provider === 'opencode' && filterInputRef.current) {
      setTimeout(() => filterInputRef.current?.focus(), 50)
    }
  }, [isOpen, provider])

  // Get current model display label
  const getModelLabel = () => {
    if (provider === 'claude') {
      const currentModel = CLAUDE_MODELS.find((m) => m.id === model)
      return currentModel?.label || 'Opus'
    }
    if (opencodeModel) {
      const parts = opencodeModel.split('/')
      return parts.length > 1 ? parts[1] : opencodeModel
    }
    return 'Select model'
  }

  // Sort and filter OpenCode providers
  const sortedOpencodeProviders = useMemo(() => {
    const sorted = Object.entries(opencodeProviders).sort(([a], [b]) => a.localeCompare(b))
    if (!modelFilter.trim()) return sorted

    const filter = modelFilter.toLowerCase()
    return sorted
      .map(([providerName, models]) => {
        const filteredModels = models.filter(
          (modelName) =>
            modelName.toLowerCase().includes(filter) ||
            providerName.toLowerCase().includes(filter)
        )
        return [providerName, filteredModels] as [string, string[]]
      })
      .filter(([, models]) => models.length > 0)
  }, [opencodeProviders, modelFilter])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => {
          const newState = !isOpen
          setIsOpen(newState)
          if (!newState) setModelFilter('')
        }}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-2xl transition-colors bg-muted/60 text-foreground hover:bg-muted"
      >
        <span className="max-w-[80px] truncate">{getModelLabel()}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform flex-shrink-0', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 max-h-64 overflow-y-auto rounded-xl shadow-xl backdrop-blur-sm z-50 animate-in fade-in-0 slide-in-from-top-1 duration-150 scrollbar-thin bg-popover/95 border border-border scrollbar-thumb-muted">
          {/* Claude Models */}
          {provider === 'claude' && (
            <>
              {CLAUDE_MODELS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onModelChange(option.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left transition-colors flex items-center justify-between hover:bg-muted/50',
                    model === option.id ? 'bg-accent/10 text-accent' : 'text-foreground'
                  )}
                >
                  <div>
                    <div className="font-medium text-xs">{option.label}</div>
                    <div className="text-[10px] text-muted-foreground">{option.description}</div>
                  </div>
                  {model === option.id && <Check className="w-3.5 h-3.5 flex-shrink-0 text-accent" />}
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
                  placeholder="Filter models..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none transition-colors bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              {sortedOpencodeProviders.length === 0 && modelFilter && (
                <div className="px-3 py-4 text-xs text-center text-muted-foreground">
                  No models match "{modelFilter}"
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
                          onOpencodeModelChange(fullModelId)
                          setIsOpen(false)
                          setModelFilter('')
                        }}
                        className={cn(
                          'w-full px-3 py-1.5 text-left transition-colors flex items-center justify-between hover:bg-muted/50',
                          isSelected ? 'bg-accent/10 text-accent' : 'text-foreground'
                        )}
                      >
                        <span className="text-xs truncate">{modelName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-2 text-accent" />}
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
  )
}

interface ChatPanelProps {
  sessions: ChatSession[]
  session: ChatSession | null
  isLoading: boolean
  provider: AgentType
  model: ClaudeModelId
  opencodeModel: string | null
  opencodeProviders: Record<string, string[]>
  isOpencodeAvailable: boolean
  onProviderChange: (provider: AgentType) => void
  onModelChange: (model: ClaudeModelId) => void
  onOpencodeModelChange: (model: string) => void
  onSendMessage: (message: string) => void
  onSelectSession: (session: ChatSession) => void
  onCreateSession: () => void
  onDeleteSession: (id: string) => void
}

export function ChatPanel({
  sessions,
  session,
  isLoading,
  provider,
  model,
  opencodeModel,
  opencodeProviders,
  isOpencodeAvailable,
  onProviderChange,
  onModelChange,
  onOpencodeModelChange,
  onSendMessage,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
}: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messages = session?.messages || []

  // Auto-scroll to bottom when new messages arrive
  const lastMessageContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages.length, lastMessageContent])

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header with session dropdown */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex-1 justify-between h-auto py-1.5 px-2 rounded-md hover:bg-muted/50 flex items-center">
              <div className="text-left min-w-0">
                <div className="text-sm font-medium truncate">
                  {session?.title || 'Select a chat'}
                </div>
                {session && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{session.messageCount} messages</span>
                    <span>·</span>
                    <span>
                      {AGENT_DISPLAY_NAMES[session.provider]}{' '}
                      {session.model && (
                        session.provider === 'claude'
                          ? CLAUDE_MODEL_NAMES[session.model] || session.model
                          : session.model
                      )}
                    </span>
                  </div>
                )}
              </div>
              <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {sessions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                No chats yet
              </div>
            ) : (
              sessions.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  className="flex items-center justify-between gap-2"
                  onSelect={() => onSelectSession(s)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.messageCount} msgs · {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(s.id)
                    }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateSession}>
              <Plus className="size-4 mr-2" />
              New Chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Provider Toggle */}
        {isOpencodeAvailable && (
          <div className="flex items-center rounded-full p-0.5 bg-muted/60">
            <button
              onClick={() => onProviderChange('claude')}
              className={cn(
                'px-2 py-1 text-[10px] font-medium rounded-full transition-all',
                provider === 'claude'
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Claude
            </button>
            <button
              onClick={() => onProviderChange('opencode')}
              className={cn(
                'px-2 py-1 text-[10px] font-medium rounded-full transition-all',
                provider === 'opencode'
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              OpenCode
            </button>
          </div>
        )}

        {/* Model Dropdown */}
        <ModelDropdown
          provider={provider}
          model={model}
          opencodeModel={opencodeModel}
          opencodeProviders={opencodeProviders}
          onModelChange={onModelChange}
          onOpencodeModelChange={onOpencodeModelChange}
        />

        <Button size="icon-sm" variant="ghost" onClick={onCreateSession} title="New chat">
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Empty state or messages */}
      {!session ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Bot className="size-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm">Select or create a chat to get started</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onCreateSession}>
              <Plus className="size-4 mr-2" />
              New Chat
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 px-4 overflow-y-auto">
            <div className="py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Start a conversation by sending a message
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageItem key={msg.id} message={msg} />
                ))
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-accent/30 to-accent/20 border border-accent/40">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 rounded-2xl px-4 py-3 bg-card/50 border border-border/50 rounded-tl-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                      <span className="animate-pulse">Thinking</span>
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full animate-bounce bg-accent" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full animate-bounce bg-accent" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 rounded-full animate-bounce bg-accent" style={{ animationDelay: '300ms' }} />
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <ChatInput onSend={onSendMessage} isLoading={isLoading} />
        </>
      )}
    </div>
  )
}

/**
 * Strip chart code blocks from message content and replace with a placeholder
 * This keeps the chat clean since charts render in the canvas panel
 */
function formatMessageForChat(content: string): string {
  // Replace chart/mdx-chart blocks with a placeholder
  return content.replace(
    /```(?:chart|mdx-chart)\s*[\s\S]*?```/g,
    '*📊 Chart rendered in canvas →*'
  )
}

interface MessageItemProps {
  message: ChatMessage
}

function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const displayContent = isUser ? message.content : formatMessageForChat(message.content)

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-muted border border-border'
            : 'bg-gradient-to-br from-accent/30 to-accent/20 border border-accent/40'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-accent" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex-1 min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm overflow-hidden text-foreground',
          isUser
            ? 'bg-muted/50 border border-border/50 rounded-tr-sm'
            : 'bg-card/50 border border-border/50 rounded-tl-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div data-color-mode={isDark ? 'dark' : 'light'}>
            <MarkdownPreview
              source={displayContent}
              style={{
                backgroundColor: 'transparent',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-sans)',
              }}
              className="prose-sm max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-muted/50 [&_pre]:border [&_pre]:border-border/50 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-accent [&_a]:text-accent [&_a:hover]:text-accent/80 [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:text-foreground [&_table]:border-border [&_th]:bg-muted [&_th]:border-border [&_td]:border-border"
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
}

function ChatInput({ onSend, isLoading }: ChatInputProps) {
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
    <div className="border-t border-border p-4">
      <div className="relative flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-muted/50 rounded-xl border border-border outline-none resize-none text-sm leading-relaxed min-h-[44px] max-h-[150px] disabled:opacity-50 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-accent/20"
          placeholder="Ask anything..."
          style={{ scrollbarWidth: 'none' }}
        />

        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          className="p-3 rounded-xl transition-all bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground text-center">
        Press <kbd className="px-1 py-0.5 rounded text-[9px] bg-muted border border-border">Shift + Enter</kbd> for new line
      </p>
    </div>
  )
}
