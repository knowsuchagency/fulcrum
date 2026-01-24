import { useEffect, useRef, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { useRouterState } from '@tanstack/react-router'
import { Bot, X, Trash2, Info } from 'lucide-react'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'
import { useChat } from '@/hooks/use-chat'
import { MODEL_OPTIONS } from '@/stores/chat-store'

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
    setTaskId,
    setModel,
  } = useChat()

  const scrollRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
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

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message)
    },
    [sendMessage]
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
          background:
            'linear-gradient(135deg, rgba(99,102,241,0.8) 0%, rgba(168,85,247,0.8) 100%)',
          boxShadow:
            '0 0 20px rgba(139, 92, 246, 0.7), 0 0 40px rgba(124, 58, 237, 0.5), 0 0 60px rgba(109, 40, 217, 0.3)',
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

        {/* Glowing animation */}
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-indigo-500" />
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
          <div className="relative flex flex-col rounded-3xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 border border-zinc-500/50 shadow-2xl backdrop-blur-3xl overflow-hidden max-h-[min(600px,calc(100vh-140px))]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-zinc-400">AI Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs font-medium bg-zinc-800/60 text-zinc-300 rounded-2xl">
                  {currentModel?.label}
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl">
                  Pro
                </span>
                {hasMessages && (
                  <button
                    onClick={clearMessages}
                    className="p-1.5 rounded-full hover:bg-zinc-700/50 transition-colors"
                    title="Clear conversation"
                  >
                    <Trash2 className="w-4 h-4 text-zinc-400" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-1.5 rounded-full hover:bg-zinc-700/50 transition-colors"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </div>

            {/* Messages */}
            {messages.length > 0 && (
              <div
                ref={scrollRef}
                className="overflow-y-auto px-4 py-2 max-h-[350px] scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              >
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as 'user' | 'assistant'}
                  content={msg.content}
                  isStreaming={msg.isStreaming}
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
            <ChatInput
              onSend={handleSend}
              isLoading={isStreaming}
              model={model}
              onModelChange={setModel}
            />

            {/* Footer Info */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1 text-xs text-zinc-500 gap-4">
              <div className="flex items-center gap-2">
                <Info className="w-3 h-3" />
                <span>
                  Press{' '}
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-zinc-400 font-mono text-xs shadow-sm">
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
                background:
                  'linear-gradient(135deg, rgba(239, 68, 68, 0.05), transparent, rgba(147, 51, 234, 0.05))',
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

        .floating-ai-button:hover {
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.9), 0 0 50px rgba(124, 58, 237, 0.7), 0 0 70px rgba(109, 40, 217, 0.5);
        }
      `}</style>
    </div>
  )
})
