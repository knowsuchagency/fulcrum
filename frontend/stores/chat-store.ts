import { types, getEnv, flow } from 'mobx-state-tree'
import type { Instance } from 'mobx-state-tree'
import { API_BASE } from '@/hooks/use-apps'
import type { Logger } from '../../shared/logger'
import type { PageContext } from '../../shared/types'
import type { ImageAttachment } from '@/components/chat/chat-input'

const STORAGE_KEY = 'fulcrum-chat-session'

export type ProviderId = 'claude' | 'opencode'
export type ClaudeModelId = 'opus' | 'sonnet' | 'haiku'

export const PROVIDER_OPTIONS: { id: ProviderId; label: string; description: string }[] = [
  { id: 'claude', label: 'Claude Code', description: 'Anthropic Claude' },
  { id: 'opencode', label: 'OpenCode', description: 'Multi-provider' },
]

export const CLAUDE_MODEL_OPTIONS: { id: ClaudeModelId; label: string; description: string }[] = [
  { id: 'opus', label: 'Opus', description: 'Most powerful' },
  { id: 'sonnet', label: 'Sonnet', description: 'Fast & capable' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest' },
]

// Legacy export for backwards compatibility
export type ModelId = ClaudeModelId
export const MODEL_OPTIONS = CLAUDE_MODEL_OPTIONS

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
    /** Error message */
    error: types.maybeNull(types.string),
    /** Selected provider */
    provider: types.optional(types.enumeration(['claude', 'opencode']), 'claude'),
    /** Selected Claude model (only used when provider is 'claude') */
    model: types.optional(types.enumeration(['opus', 'sonnet', 'haiku']), 'opus'),
    /** Selected OpenCode model (only used when provider is 'opencode') */
    opencodeModel: types.maybeNull(types.string),
  })
  .volatile(() => ({
    /** Active EventSource connection */
    eventSource: null as EventSource | null,
    /** Abort controller for fetch requests */
    abortController: null as AbortController | null,
    /** Active stream reader for cancellation */
    streamReader: null as ReadableStreamDefaultReader<Uint8Array> | null,
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

      setModel(model: 'opus' | 'sonnet' | 'haiku') {
        self.model = model
      },

      setProvider(provider: 'claude' | 'opencode') {
        // When switching providers, clear the session so a new one is created
        if (self.provider !== provider) {
          self.sessionId = null
          self.provider = provider
        }
      },

      setOpencodeModel(model: string | null) {
        self.opencodeModel = model
      },

      createSession: flow(function* () {
        const log = getLog()
        try {
          const response: Response = yield fetch(`${API_BASE}/api/chat/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: self.provider }),
          })

          if (!response.ok) {
            throw new Error('Failed to create chat session')
          }

          const { sessionId }: { sessionId: string } = yield response.json()
          self.sessionId = sessionId
          localStorage.setItem(STORAGE_KEY, sessionId)
          log.info('Created chat session', { sessionId, provider: self.provider })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.error('Failed to create chat session', { error: errorMsg })
          self.error = errorMsg
        }
      }),

      loadSession: flow(function* () {
        const log = getLog()
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return

        try {
          const response: Response = yield fetch(`${API_BASE}/api/chat/${stored}`)
          if (response.ok) {
            self.sessionId = stored
            log.info('Restored chat session', { sessionId: stored })
          } else {
            localStorage.removeItem(STORAGE_KEY)
            log.debug('Removed stale session from storage', { sessionId: stored })
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }),

      sendMessage: flow(function* sendMessage(
        message: string,
        context?: PageContext,
        images?: ImageAttachment[]
      ) {
        const log = getLog()

        if (!self.sessionId) {
          // Create session inline
          try {
            const sessionResponse: Response = yield fetch(`${API_BASE}/api/chat/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: self.provider }),
            })

            if (!sessionResponse.ok) {
              throw new Error('Failed to create chat session')
            }

            const { sessionId }: { sessionId: string } = yield sessionResponse.json()
            self.sessionId = sessionId
            localStorage.setItem(STORAGE_KEY, sessionId)
            log.info('Created chat session', { sessionId, provider: self.provider })
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            log.error('Failed to create chat session', { error: errorMsg })
            self.error = errorMsg
            return
          }
        }

        // Create abort controller for this request
        self.abortController = new AbortController()

        // Build display content (show [image] placeholders for attached images)
        let displayContent = message
        if (images && images.length > 0) {
          const imageIndicator = images.length === 1 ? '[image]' : `[${images.length} images]`
          displayContent = message ? `${imageIndicator} ${message}` : imageIndicator
        }

        // Add user message
        const userMessage = ChatMessageModel.create({
          id: crypto.randomUUID(),
          role: 'user',
          content: displayContent,
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
          self.abortController = null
          self.streamReader = null
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
          // Use the appropriate model based on provider
          const modelToSend = self.provider === 'opencode' ? self.opencodeModel : self.model

          // Prepare images for the API (extract base64 data without the data URL prefix)
          const imageData = images?.map((img) => ({
            mediaType: img.mediaType,
            data: img.dataUrl.split(',')[1], // Remove "data:image/png;base64," prefix
          }))

          const response: Response = yield fetch(`${API_BASE}/api/chat/${self.sessionId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              model: modelToSend,
              context,
              provider: self.provider,
              images: imageData,
            }),
            signal: self.abortController?.signal,
          })

          if (!response.ok) {
            throw new Error('Failed to send message')
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('No response body')
          }

          // Store reader for cancellation
          self.streamReader = reader

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
          // Handle abort gracefully (user cancelled)
          if (err instanceof Error && err.name === 'AbortError') {
            log.debug('Chat stream aborted by user')
            finishStreaming()
            return
          }
          const errorMsg = err instanceof Error ? err.message : String(err)
          log.error('Failed to send message', { error: errorMsg })
          handleError(errorMsg)
        }
      }),

      cancelStream() {
        const log = getLog()
        if (self.streamReader) {
          self.streamReader.cancel().catch(() => {
            // Ignore cancellation errors
          })
          self.streamReader = null
        }
        if (self.abortController) {
          self.abortController.abort()
          self.abortController = null
        }

        // Mark streaming as complete
        const lastMsg = self.messages[self.messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.isStreaming = false
        }
        self.isStreaming = false
        log.info('Cancelled streaming response')
      },

      clearMessages() {
        self.messages.clear()
        self.sessionId = null // Clear session so a new one is created
        self.error = null
        localStorage.removeItem(STORAGE_KEY)
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
        localStorage.removeItem(STORAGE_KEY)
      }),

      reset() {
        this.endSession()
        self.isOpen = false
      },
    }
  })

export type IChatStore = Instance<typeof ChatStore>
