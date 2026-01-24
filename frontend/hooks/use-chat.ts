import { useMemo } from 'react'
import { ChatStore, type IChatStore, type ClaudeModelId, type ProviderId } from '@/stores/chat-store'
import { createLogger } from '@/lib/logger'
import type { PageContext } from '../../shared/types'

// Legacy export for backwards compatibility
export type ModelId = ClaudeModelId

// Singleton store instance
let chatStoreInstance: IChatStore | null = null

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

    // Actions
    toggle: () => store.toggle(),
    open: () => store.setOpen(true),
    close: () => store.setOpen(false),
    sendMessage: (message: string, context?: PageContext) => store.sendMessage(message, context),
    clearMessages: () => store.clearMessages(),
    setProvider: (provider: ProviderId) => store.setProvider(provider),
    setModel: (model: ClaudeModelId) => store.setModel(model),
    setOpencodeModel: (model: string | null) => store.setOpencodeModel(model),
    reset: () => store.reset(),
  }
}
