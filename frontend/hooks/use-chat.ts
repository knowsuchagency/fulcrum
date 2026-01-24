import { useMemo } from 'react'
import { ChatStore, type IChatStore, type ModelId } from '@/stores/chat-store'
import { createLogger } from '@/lib/logger'

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
        taskId: null,
        error: null,
        model: 'opus',
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
    model: store.model as ModelId,

    // Actions
    toggle: () => store.toggle(),
    open: () => store.setOpen(true),
    close: () => store.setOpen(false),
    sendMessage: (message: string) => store.sendMessage(message),
    clearMessages: () => store.clearMessages(),
    setTaskId: (taskId: string | null) => store.setTaskId(taskId),
    setModel: (model: ModelId) => store.setModel(model),
    reset: () => store.reset(),
  }
}
