import { useMemo, useCallback, useEffect, useRef } from 'react'
import { ChatStore, type IChatStore, type ClaudeModelId, type ProviderId } from '@/stores/chat-store'
import { createLogger } from '@/lib/logger'
import type { PageContext } from '../../shared/types'
import type { ImageAttachment } from '@/components/chat/chat-input'

// Legacy export for backwards compatibility
export type ModelId = ClaudeModelId

// Singleton store instance
let chatStoreInstance: IChatStore | null = null
let sessionLoaded = false

/**
 * Get or create the chat store singleton
 */
function getChatStore(): IChatStore {
  if (!chatStoreInstance) {
    chatStoreInstance = ChatStore.create(
      {
        sessionId: null,
        messages: [],
        isStreaming: false,
        isOpen: false,
        error: null,
        provider: 'claude',
        model: 'opus',
        opencodeModel: null,
      },
      { log: createLogger('Chat') }
    )
  }
  return chatStoreInstance
}

/**
 * Hook to access the chat store
 */
export function useChat() {
  const store = useMemo(() => getChatStore(), [])
  const loadedRef = useRef(false)

  // Load session from localStorage on first mount
  useEffect(() => {
    if (!loadedRef.current && !sessionLoaded) {
      loadedRef.current = true
      sessionLoaded = true
      store.loadSession()
    }
  }, [store])

  // Memoize actions to prevent unnecessary re-renders
  const toggle = useCallback(() => store.toggle(), [store])
  const open = useCallback(() => store.setOpen(true), [store])
  const close = useCallback(() => store.setOpen(false), [store])
  const sendMessage = useCallback(
    (message: string, context?: PageContext, images?: ImageAttachment[]) =>
      store.sendMessage(message, context, images),
    [store]
  )
  const clearMessages = useCallback(() => store.clearMessages(), [store])
  const setProvider = useCallback((provider: ProviderId) => store.setProvider(provider), [store])
  const setModel = useCallback((model: ClaudeModelId) => store.setModel(model), [store])
  const setOpencodeModel = useCallback((model: string | null) => store.setOpencodeModel(model), [store])
  const reset = useCallback(() => store.reset(), [store])
  const cancelStream = useCallback(() => store.cancelStream(), [store])

  return {
    // State
    isOpen: store.isOpen,
    isStreaming: store.isStreaming,
    messages: store.messages,
    hasMessages: store.hasMessages,
    error: store.error,
    sessionId: store.sessionId,
    provider: store.provider as ProviderId,
    model: store.model as ClaudeModelId,
    opencodeModel: store.opencodeModel,

    // Actions (memoized)
    toggle,
    open,
    close,
    sendMessage,
    clearMessages,
    setProvider,
    setModel,
    setOpencodeModel,
    reset,
    cancelStream,
  }
}
