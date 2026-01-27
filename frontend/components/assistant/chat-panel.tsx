import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, User, Send, Loader2, Plus, ChevronDown, Trash2, Check, Pencil, Paperclip, X, Square } from 'lucide-react'
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
import type { AgentType } from '../../../shared/types'

// Claude models for the AI assistant (ids only, labels come from i18n)
const CLAUDE_MODEL_IDS = ['opus', 'sonnet', 'haiku'] as const

type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number]

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
  const { t } = useTranslation('assistant')
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
      return t(`models.${model}`)
    }
    if (opencodeModel) {
      const parts = opencodeModel.split('/')
      return parts.length > 1 ? parts[1] : opencodeModel
    }
    return t('models.selectModel')
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
              {CLAUDE_MODEL_IDS.map((modelId) => (
                <button
                  key={modelId}
                  onClick={() => {
                    onModelChange(modelId)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left transition-colors flex items-center justify-between hover:bg-muted/50',
                    model === modelId ? 'bg-accent/10 text-accent' : 'text-foreground'
                  )}
                >
                  <div>
                    <div className="font-medium text-xs">{t(`models.${modelId}`)}</div>
                    <div className="text-[10px] text-muted-foreground">{t(`models.${modelId}Description`)}</div>
                  </div>
                  {model === modelId && <Check className="w-3.5 h-3.5 flex-shrink-0 text-accent" />}
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

export interface ImageAttachment {
  id: string
  file: File
  dataUrl: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
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
  onSendMessage: (message: string, images?: ImageAttachment[]) => void
  onSelectSession: (session: ChatSession) => void
  onCreateSession: () => void
  onDeleteSession: (id: string) => void
  onUpdateSessionTitle: (id: string, title: string) => void
  onStopStreaming?: () => void
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
  onUpdateSessionTitle,
  onStopStreaming,
}: ChatPanelProps) {
  const { t } = useTranslation('assistant')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const messages = session?.messages || []
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')

  // Auto-scroll to bottom when new messages arrive
  const lastMessageContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages.length, lastMessageContent])

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Start editing title
  const handleStartEditTitle = useCallback(() => {
    if (session) {
      setEditedTitle(session.title)
      setIsEditingTitle(true)
    }
  }, [session])

  // Save title
  const handleSaveTitle = useCallback(() => {
    if (session && editedTitle.trim()) {
      onUpdateSessionTitle(session.id, editedTitle.trim())
    }
    setIsEditingTitle(false)
  }, [session, editedTitle, onUpdateSessionTitle])

  // Handle title input keydown
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
    }
  }, [handleSaveTitle])

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header with session dropdown */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        {/* Editable title or dropdown */}
        {isEditingTitle && session ? (
          <input
            ref={titleInputRef}
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={handleTitleKeyDown}
            className="flex-1 px-2 py-1.5 text-sm font-medium bg-muted/50 border border-border rounded-md outline-none focus:ring-2 focus:ring-accent/20"
          />
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex-1 min-w-0 max-w-[180px] justify-between h-auto py-1.5 px-2 rounded-md hover:bg-muted/50 flex items-center">
              <div className="text-left min-w-0">
                <div className="text-sm font-medium truncate">
                  {session?.title || t('chat.selectChat')}
                </div>
                {session && (
                  <div className="text-xs text-muted-foreground">
                    {session.messageCount} {t('chat.messages')}
                  </div>
                )}
              </div>
              <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {/* Current session actions */}
            {session && (
              <>
                <DropdownMenuItem onClick={handleStartEditTitle}>
                  <Pencil className="size-4 mr-2" />
                  {t('chat.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDeleteSession(session.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4 mr-2" />
                  {t('chat.delete')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Session list */}
            {sessions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                {t('chat.noChatsYet')}
              </div>
            ) : (
              sessions.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2",
                    s.id === session?.id && "bg-accent/10"
                  )}
                  onClick={() => onSelectSession(s)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.messageCount} {t('chat.msgs')} · {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  {s.id === session?.id && (
                    <Check className="size-4 text-accent flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateSession}>
              <Plus className="size-4 mr-2" />
              {t('chat.newChat')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}

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
              {t('providers.claude')}
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
              {t('providers.opencode')}
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

        <Button size="icon-sm" variant="ghost" onClick={onCreateSession} title={t('chat.newChat')}>
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Empty state or messages */}
      {!session ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Bot className="size-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm">{t('chat.selectOrCreate')}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onCreateSession}>
              <Plus className="size-4 mr-2" />
              {t('chat.newChat')}
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
                  {t('chat.startConversation')}
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
                      <span className="animate-pulse">{t('chat.thinking')}</span>
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
          <ChatInput onSend={onSendMessage} isLoading={isLoading} onCancel={onStopStreaming} />
        </>
      )}
    </div>
  )
}

/**
 * Strip special content blocks from message and replace with placeholders
 * This keeps the chat clean since these render in dedicated panels
 */
function formatMessageForChat(content: string): string {
  let result = content

  // Replace chart/mdx-chart blocks with a placeholder
  result = result.replace(
    /```(?:chart|mdx-chart)\s*[\s\S]*?```/g,
    '*📊 Chart rendered in canvas →*'
  )

  // Replace <canvas> tags with a placeholder
  result = result.replace(
    /<canvas>[\s\S]*?<\/canvas>/g,
    '*🖼️ Content displayed in canvas →*'
  )

  // Replace <editor> tags with a placeholder
  result = result.replace(
    /<editor>[\s\S]*?<\/editor>/g,
    '*📝 Document updated in editor →*'
  )

  return result
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

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

interface ChatInputProps {
  onSend: (message: string, images?: ImageAttachment[]) => void
  isLoading: boolean
  onCancel?: () => void
}

function ChatInput({ onSend, isLoading, onCancel }: ChatInputProps) {
  const { t } = useTranslation('assistant')
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className="border-t border-border p-4">
      {/* Image Previews */}
      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="relative flex items-end gap-2">
        {/* Attach Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={cn(
            'p-3 rounded-xl transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Attach image"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-muted/50 rounded-xl border border-border outline-none resize-none text-sm leading-relaxed min-h-[44px] max-h-[150px] disabled:opacity-50 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-accent/20"
          placeholder={t('input.askAnything')}
          style={{ scrollbarWidth: 'none' }}
        />

        {isLoading && onCancel ? (
          <button
            onClick={onCancel}
            className="p-3 rounded-xl transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90"
            title="Stop generating"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!hasContent || isLoading}
            className="p-3 rounded-xl transition-all bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground text-center">
        {t('input.shiftEnterHint').split('<kbd>').map((part, i) => {
          if (i === 0) return part
          const [kbd, rest] = part.split('</kbd>')
          return (
            <span key={i}>
              <kbd className="px-1 py-0.5 rounded text-[9px] bg-muted border border-border">{kbd}</kbd>
              {rest}
            </span>
          )
        })}
      </p>
    </div>
  )
}
