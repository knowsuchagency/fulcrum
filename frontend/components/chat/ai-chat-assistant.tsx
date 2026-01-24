import { useEffect, useRef, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { useRouterState } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiBrain01Icon, Cancel01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { useChat } from '@/hooks/use-chat'
import { cn } from '@/lib/utils'

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
    toggle,
    close,
    sendMessage,
    clearMessages,
    setTaskId,
  } = useChat()

  const scrollRef = useRef<HTMLDivElement>(null)
  const location = useRouterState({ select: (s) => s.location })

  // Extract task ID from URL if on task detail page
  useEffect(() => {
    const path = location.pathname
    if (path.startsWith('/tasks/')) {
      const taskId = path.split('/')[2]
      if (taskId && taskId !== 'new') {
        setTaskId(taskId)
      } else {
        setTaskId(null)
      }
    } else {
      setTaskId(null)
    }
  }, [location.pathname, setTaskId])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, messages[messages.length - 1]?.content])

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

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message)
    },
    [sendMessage]
  )

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-[380px] sm:w-[420px] animate-in slide-in-from-bottom-2 duration-200">
          <div className="rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[min(600px,calc(100vh-120px))]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={AiBrain01Icon} className="size-5 text-primary" />
                <span className="font-medium text-sm">AI Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                {hasMessages && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearMessages}
                    title="Clear conversation"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={close}>
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0">
              <div ref={scrollRef} className="px-4 py-2">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <HugeiconsIcon icon={AiBrain01Icon} className="size-8 mx-auto mb-3 opacity-50" />
                    <p>Hi! I can help you manage tasks,</p>
                    <p>run commands, and more.</p>
                    <p className="mt-2 text-xs opacity-75">
                      Try: "List my tasks" or "Create a new task"
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role as 'user' | 'assistant'}
                      content={msg.content}
                      isStreaming={msg.isStreaming}
                    />
                  ))
                )}

                {/* Error display */}
                {error && (
                  <div className="mt-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <ChatInput onSend={handleSend} isLoading={isStreaming} />
          </div>
        </div>
      )}

      {/* Floating Button */}
      <Button
        onClick={toggle}
        className={cn(
          'size-12 rounded-full shadow-lg transition-all duration-200',
          'hover:scale-105 active:scale-95',
          isOpen && 'bg-muted hover:bg-muted/80'
        )}
        size="icon-lg"
      >
        <HugeiconsIcon
          icon={isOpen ? Cancel01Icon : AiBrain01Icon}
          className={cn('size-6', !isOpen && 'text-primary-foreground')}
        />
      </Button>
    </div>
  )
})
