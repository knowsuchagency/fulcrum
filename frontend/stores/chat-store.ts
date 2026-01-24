import { types, getEnv, flow } from 'mobx-state-tree'
import type { Instance } from 'mobx-state-tree'
import { API_BASE } from '@/hooks/use-apps'
import type { Logger } from '../../shared/logger'

export type ModelId = 'opus' | 'sonnet' | 'haiku'

export const MODEL_OPTIONS: { id: ModelId; label: string; description: string }[] = [
  { id: 'sonnet', label: 'Sonnet', description: 'Fast & capable' },
  { id: 'opus', label: 'Opus', description: 'Most powerful' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest' },
]

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  toolCalls?: Array<{
    name: string
    status: 'pending' | 'running' | 'complete' | 'error'
    result?: string
  }>
}

/**
 * Environment injected into the store.
 */
export interface ChatStoreEnv {
  log: Logger
}

/**
 * MST model for a chat message
 */
const ChatMessageModel = types.model('ChatMessage', {
  id: types.identifier,
  role: types.enumeration(['user', 'assistant']),
  content: types.string,
  timestamp: types.Date,
  isStreaming: types.optional(types.boolean, false),
})

/**
 * Chat Store
 *
 * Manages SSE connection for real-time chat streaming.
 * Uses MST for predictable state management and logging.
 */
export const ChatStore = types
  .model('ChatStore', {
    /** Current session ID */
    sessionId: types.maybeNull(types.string),
    /** Chat messages */
    messages: types.array(ChatMessageModel),
    /** Whether a response is streaming */
    isStreaming: types.optional(types.boolean, false),
    /** Whether the chat panel is open */
    isOpen: types.optional(types.boolean, false),
    /** Current task ID for context */
    taskId: types.maybeNull(types.string),
    /** Error message */
    error: types.maybeNull(types.string),
    /** Selected model */
    model: types.optional(types.enumeration(['opus', 'sonnet', 'haiku']), 'sonnet'),
  })
  .volatile(() => ({
    /** Active EventSource connection */
    eventSource: null as EventSource | null,
    /** Abort controller for fetch requests */
    abortController: null as AbortController | null,
  }))
  .views((self) => ({
    get hasMessages(): boolean {
      return self.messages.length > 0
    },
    get lastMessage(): Instance<typeof ChatMessageModel> | undefined {
      return self.messages[self.messages.length - 1]
    },
  }))
  .actions((self) => {
    const getLog = () => getEnv<ChatStoreEnv>(self).log

    return {
      setOpen(open: boolean) {
        self.isOpen = open
        if (open && !self.sessionId) {
          // Create session when opening for the first time
          this.createSession()
        }
      },

      toggle() {
        this.setOpen(!self.isOpen)
      },

      setTaskId(taskId: string | null) {
        self.taskId = taskId
      },

      setModel(model: 'opus' | 'sonnet' | 'haiku') {
        self.model = model
      },

      createSession: flow(function* () {
        const log = getLog()
        try {
          const response: Response = yield fetch(`${API_BASE}/api/chat/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: self.taskId }),
          })

          if (!response.ok) {
            throw new Error('Failed to create chat session')
          }

          const { sessionId }: { sessionId: string } = yield response.json()
          self.sessionId = sessionId
          log.info('Created chat session', { sessionId, taskId: self.taskId })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.error('Failed to create chat session', { error: errorMsg })
          self.error = errorMsg
        }
      }),

      sendMessage: flow(function* sendMessage(message: string) {
        const log = getLog()

        if (!self.sessionId) {
          // Create session inline
          try {
            const sessionResponse: Response = yield fetch(`${API_BASE}/api/chat/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: self.taskId }),
            })

            if (!sessionResponse.ok) {
              throw new Error('Failed to create chat session')
            }

            const { sessionId }: { sessionId: string } = yield sessionResponse.json()
            self.sessionId = sessionId
            log.info('Created chat session', { sessionId, taskId: self.taskId })
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            log.error('Failed to create chat session', { error: errorMsg })
            self.error = errorMsg
            return
          }
        }

        // Add user message
        const userMessage = ChatMessageModel.create({
          id: crypto.randomUUID(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        })
        self.messages.push(userMessage)

        // Create placeholder for assistant response
        const assistantMessage = ChatMessageModel.create({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        })
        self.messages.push(assistantMessage)
        self.isStreaming = true
        self.error = null

        // Helper functions to update state
        const updateLastMessage = (content: string) => {
          const lastMsg = self.messages[self.messages.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = content
          }
        }

        const finishStreaming = () => {
          const lastMsg = self.messages[self.messages.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.isStreaming = false
          }
          self.isStreaming = false
        }

        const handleError = (errorMsg: string) => {
          log.error('Chat error', { error: errorMsg })
          self.error = errorMsg
          self.isStreaming = false

          const lastMsg = self.messages[self.messages.length - 1]
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content) {
            self.messages.pop()
          } else if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.isStreaming = false
          }
        }

        try {
          // Close any existing connection
          if (self.eventSource) {
            self.eventSource.close()
            self.eventSource = null
          }

          // Send message and stream response
          const response: Response = yield fetch(`${API_BASE}/api/chat/${self.sessionId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, model: self.model }),
          })

          if (!response.ok) {
            throw new Error('Failed to send message')
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('No response body')
          }

          const decoder = new TextDecoder()
          let buffer = ''
          let currentContent = ''

          while (true) {
            const { done, value }: ReadableStreamReadResult<Uint8Array> = yield reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Parse SSE events from buffer
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                // Next line should be data
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6)
                try {
                  const parsed = JSON.parse(data)

                  // Handle different event types
                  if ('text' in parsed) {
                    // content:delta
                    currentContent += parsed.text
                    updateLastMessage(currentContent)
                  } else if ('content' in parsed) {
                    // message:complete
                    updateLastMessage(parsed.content)
                  } else if ('message' in parsed) {
                    // error
                    handleError(parsed.message)
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }

          // Mark streaming as complete
          finishStreaming()
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.error('Failed to send message', { error: errorMsg })
          handleError(errorMsg)
        }
      }),

      clearMessages() {
        self.messages.clear()
        self.sessionId = null // Clear session so a new one is created
        self.error = null
      },

      endSession: flow(function* () {
        const log = getLog()

        if (self.sessionId) {
          try {
            yield fetch(`${API_BASE}/api/chat/${self.sessionId}`, {
              method: 'DELETE',
            })
            log.info('Ended chat session', { sessionId: self.sessionId })
          } catch (err) {
            log.warn('Failed to end chat session', { error: String(err) })
          }
        }

        if (self.eventSource) {
          self.eventSource.close()
          self.eventSource = null
        }

        self.sessionId = null
        self.messages.clear()
        self.isStreaming = false
        self.error = null
      }),

      reset() {
        this.endSession()
        self.isOpen = false
        self.taskId = null
      },
    }
  })

export type IChatStore = Instance<typeof ChatStore>
