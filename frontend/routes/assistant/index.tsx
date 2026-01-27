import { useState, useCallback, useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AssistantLayout, type ClaudeModelId } from '@/components/assistant'
import type { ChatSession, ChatMessage, Artifact, Document } from '@/components/assistant'
import type { ImageAttachment } from '@/components/assistant/chat-panel'
import type { AgentType } from '../../../shared/types'
import { log } from '@/lib/logger'
import { useOpencodeModels } from '@/hooks/use-opencode-models'
import { useOpencodeModel as useOpencodeModelSetting, useAssistantProvider, useAssistantModel } from '@/hooks/use-config'

/** Generate a default title for new chats based on current timestamp */
function generateDefaultTitle(): string {
  return format(new Date(), "MMM d, h:mm a")
}

interface SessionsResponse {
  sessions: ChatSession[]
  total: number
}

interface ArtifactsResponse {
  artifacts: Artifact[]
  total: number
}

interface DocumentsResponse {
  documents: Document[]
}

interface SessionWithMessages extends ChatSession {
  messages: ChatMessage[]
}

type CanvasTab = 'viewer' | 'editor' | 'documents'
type MobilePanel = 'chat' | 'canvas'

function AssistantView() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { chat: chatId, tab: canvasActiveTab = 'viewer', panel: mobileView = 'chat' } = Route.useSearch()
  const [isStreaming, setIsStreaming] = useState(false)
  const [provider, setProvider] = useState<AgentType>('claude')
  const [model, setModel] = useState<ClaudeModelId>('sonnet')
  const [opencodeModel, setOpencodeModel] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [canvasContent, setCanvasContent] = useState<string | null>(null)
  const editorSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  // Set canvas active tab via URL
  const setCanvasActiveTab = useCallback((tab: 'viewer' | 'editor' | 'documents') => {
    navigate({
      to: '/assistant',
      search: (prev) => ({ chat: prev.chat, panel: prev.panel as MobilePanel | undefined, tab }),
      replace: true,
    })
  }, [navigate])

  // Set mobile panel via URL
  const setMobileView = useCallback((panel: MobilePanel) => {
    navigate({
      to: '/assistant',
      search: (prev) => ({ chat: prev.chat, tab: prev.tab as CanvasTab | undefined, panel }),
      replace: true,
    })
  }, [navigate])

  // Fetch OpenCode models and defaults from settings
  const { providers: opencodeProviders, installed: opencodeInstalled } = useOpencodeModels()
  const { data: defaultOpencodeModel } = useOpencodeModelSetting()
  const { data: defaultProvider } = useAssistantProvider()
  const { data: defaultModel } = useAssistantModel()

  // Check if OpenCode is available
  const isOpencodeAvailable = opencodeInstalled && Object.keys(opencodeProviders).length > 0

  // Initialize from settings on mount
  useEffect(() => {
    if (defaultProvider) setProvider(defaultProvider)
    if (defaultModel) setModel(defaultModel)
  }, [defaultProvider, defaultModel])

  // Initialize OpenCode model from settings when switching to opencode
  useEffect(() => {
    if (provider === 'opencode' && !opencodeModel && defaultOpencodeModel) {
      setOpencodeModel(defaultOpencodeModel)
    }
  }, [provider, opencodeModel, defaultOpencodeModel])

  // Fetch sessions
  const { data: sessionsData, isLoading: isLoadingSessions } = useQuery<SessionsResponse>({
    queryKey: ['assistant-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/assistant/sessions')
      if (!res.ok) throw new Error('Failed to fetch sessions')
      return res.json()
    },
  })

  // Fetch selected session with messages
  const { data: selectedSession } = useQuery<SessionWithMessages>({
    queryKey: ['assistant-session', chatId],
    queryFn: async () => {
      if (!chatId) throw new Error('No session selected')
      const res = await fetch(`/api/assistant/sessions/${chatId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json()
    },
    enabled: !!chatId,
  })

  // Fetch artifacts for selected session
  const { data: artifactsData } = useQuery<ArtifactsResponse>({
    queryKey: ['assistant-artifacts', chatId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (chatId) params.set('sessionId', chatId)
      const res = await fetch(`/api/assistant/artifacts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch artifacts')
      return res.json()
    },
    enabled: !!chatId,
  })

  // Fetch all documents
  const { data: documentsData } = useQuery<DocumentsResponse>({
    queryKey: ['assistant-documents'],
    queryFn: async () => {
      const res = await fetch('/api/assistant/documents')
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
  })

  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)

  // Clear state when session changes (before new data loads)
  useEffect(() => {
    setSelectedArtifact(null)
    setEditorContent('') // Clear editor immediately when switching sessions
    setCanvasContent(null) // Clear canvas when switching sessions
  }, [chatId])

  // Load editor content from session once it's loaded
  useEffect(() => {
    if (selectedSession?.editorContent) {
      setEditorContent(selectedSession.editorContent)
    }
  }, [selectedSession?.id, selectedSession?.editorContent])

  // Save editor content mutation
  const saveEditorContentMutation = useMutation({
    mutationFn: async ({ sessionId, content }: { sessionId: string; content: string }) => {
      const res = await fetch(`/api/assistant/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editorContent: content, saveDocument: true }),
      })
      if (!res.ok) throw new Error('Failed to save editor content')
      return res.json()
    },
    onSuccess: () => {
      // Refresh documents list when editor content is saved
      queryClient.invalidateQueries({ queryKey: ['assistant-documents'] })
    },
  })

  // Debounced save for editor content
  const handleEditorContentChange = useCallback((content: string) => {
    setEditorContent(content)

    // Clear existing timeout
    if (editorSaveTimeoutRef.current) {
      clearTimeout(editorSaveTimeoutRef.current)
    }

    // Debounce save
    if (chatId) {
      editorSaveTimeoutRef.current = setTimeout(() => {
        saveEditorContentMutation.mutate({ sessionId: chatId, content })
      }, 1000) // Save after 1 second of inactivity
    }
  }, [chatId, saveEditorContentMutation])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (editorSaveTimeoutRef.current) {
        clearTimeout(editorSaveTimeoutRef.current)
      }
    }
  }, [])

  // Update URL when session changes
  const setSelectedSessionId = useCallback((id: string | null) => {
    navigate({
      to: '/assistant',
      search: (prev) => ({ chat: id || undefined, tab: prev.tab as CanvasTab | undefined, panel: prev.panel as MobilePanel | undefined }),
      replace: true,
    })
  }, [navigate])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/assistant/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: generateDefaultTitle(),
          provider,
          model,
        }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(error.error || 'Failed to create session')
      }
      return res.json() as Promise<ChatSession>
    },
    onSuccess: (session) => {
      // Optimistically set the session data with empty messages
      // This prevents the empty state from flashing while the query loads
      queryClient.setQueryData<SessionWithMessages>(
        ['assistant-session', session.id],
        { ...session, messages: [] }
      )
      queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      setSelectedSessionId(session.id)
    },
    onError: (error) => {
      log.assistant.error('Failed to create session', { error })
    },
  })

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assistant/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete session')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      if (chatId) {
        setSelectedSessionId(null)
      }
    },
  })

  // Update session title mutation
  const updateSessionTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/assistant/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('Failed to update session title')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['assistant-session', chatId] })
    },
  })

  // Star document mutation
  const starDocumentMutation = useMutation({
    mutationFn: async ({ sessionId, starred }: { sessionId: string; starred: boolean }) => {
      const res = await fetch(`/api/assistant/documents/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred }),
      })
      if (!res.ok) throw new Error('Failed to star document')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-documents'] })
    },
  })

  // Rename document mutation
  const renameDocumentMutation = useMutation({
    mutationFn: async ({ sessionId, filename }: { sessionId: string; filename: string }) => {
      const res = await fetch(`/api/assistant/documents/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      if (!res.ok) throw new Error('Failed to rename document')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-documents'] })
    },
  })

  // Handle document selection - navigate to chat and switch to editor tab
  const handleSelectDocument = useCallback((doc: Document) => {
    navigate({
      to: '/assistant',
      search: (prev) => ({ chat: doc.sessionId, tab: 'editor' as const, panel: prev.panel as MobilePanel | undefined }),
      replace: true,
    })
  }, [navigate])

  // Send message handler
  const handleSendMessage = useCallback(
    async (message: string, images?: ImageAttachment[]) => {
      if (!chatId || isStreaming) return

      setIsStreaming(true)

      // Create abort controller for this request
      abortControllerRef.current = new AbortController()

      // Build display content (show [image] placeholders for attached images)
      let displayContent = message
      if (images && images.length > 0) {
        const imageIndicator = images.length === 1 ? '[image]' : `[${images.length} images]`
        displayContent = message ? `${imageIndicator} ${message}` : imageIndicator
      }

      // Optimistically add user message
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        sessionId: chatId,
        role: 'user',
        content: displayContent,
        toolCalls: null,
        artifacts: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData<SessionWithMessages>(
        ['assistant-session', chatId],
        (old) => {
          if (!old) return old
          return { ...old, messages: [...old.messages, userMessage] }
        }
      )

      // Use current model from state
      const currentModel = model

      // Prepare images for the API (extract base64 data without the data URL prefix)
      const imageData = images?.map((img) => ({
        mediaType: img.mediaType,
        data: img.dataUrl.split(',')[1], // Remove "data:image/png;base64," prefix
      }))

      try {
        const response = await fetch(`/api/assistant/sessions/${chatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            model: currentModel,
            editorContent: editorContent || undefined,
            images: imageData,
          }),
          signal: abortControllerRef.current?.signal,
        })

        if (!response.ok) throw new Error('Failed to send message')

        // Create EventSource for SSE
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        // Store reader for cancellation
        streamReaderRef.current = reader

        const decoder = new TextDecoder()
        let assistantContent = ''
        let currentEventType = ''
        let buffer = '' // Buffer for incomplete SSE lines

        // Add placeholder for assistant message
        const assistantMessage: ChatMessage = {
          id: `temp-assistant-${Date.now()}`,
          sessionId: chatId,
          role: 'assistant',
          content: '',
          toolCalls: null,
          artifacts: null,
          model: currentModel,
          tokensIn: null,
          tokensOut: null,
          createdAt: new Date().toISOString(),
        }

        queryClient.setQueryData<SessionWithMessages>(
          ['assistant-session', chatId],
          (old) => {
            if (!old) return old
            return { ...old, messages: [...old.messages, assistantMessage] }
          }
        )

        // Helper function to process a single SSE line
        const processLine = (line: string) => {
          log.assistant.debug('Processing SSE line', { line, currentEventType })
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
            log.assistant.debug('Set event type', { currentEventType })
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              log.assistant.debug('Parsed SSE data', { currentEventType, dataKeys: Object.keys(data), data })

              // Check if this is a document event
              if (currentEventType === 'document') {
                log.assistant.info('Found document event type', { content: data.content })
              }

              if (currentEventType === 'content:delta' && data.text) {
                assistantContent += data.text
                queryClient.setQueryData<SessionWithMessages>(
                  ['assistant-session', chatId],
                  (old) => {
                    if (!old) return old
                    const messages = [...old.messages]
                    const lastMessage = messages[messages.length - 1]
                    if (lastMessage?.role === 'assistant') {
                      messages[messages.length - 1] = {
                        ...lastMessage,
                        content: assistantContent,
                      }
                    }
                    return { ...old, messages }
                  }
                )
              } else if (currentEventType === 'artifacts' && data.artifacts) {
                queryClient.invalidateQueries({ queryKey: ['assistant-artifacts', chatId] })
                if (data.artifacts.length > 0) {
                  setSelectedArtifact(data.artifacts[0])
                }
              } else if (currentEventType === 'document' && data.content) {
                log.assistant.info('DOCUMENT EVENT MATCHED - updating editor', { content: data.content })
                setEditorContent(data.content)
                saveEditorContentMutation.mutate({ sessionId: chatId, content: data.content })
                // Also save as document file and refresh documents list
                fetch(`/api/assistant/documents/${chatId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ content: data.content }),
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['assistant-documents'] })
                })
              } else if (currentEventType === 'canvas' && data.content) {
                log.assistant.info('CANVAS EVENT - updating viewer', { contentPreview: data.content.slice(0, 100) })
                setCanvasContent(data.content)
              } else if (!currentEventType && data.text) {
                assistantContent += data.text
                queryClient.setQueryData<SessionWithMessages>(
                  ['assistant-session', chatId],
                  (old) => {
                    if (!old) return old
                    const messages = [...old.messages]
                    const lastMessage = messages[messages.length - 1]
                    if (lastMessage?.role === 'assistant') {
                      messages[messages.length - 1] = {
                        ...lastMessage,
                        content: assistantContent,
                      }
                    }
                    return { ...old, messages }
                  }
                )
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Read SSE stream
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Process any remaining data in buffer before exiting
            log.assistant.debug('Stream done', { remainingBuffer: buffer })
            if (buffer.trim()) {
              const lines = buffer.split('\n')
              log.assistant.debug('Processing remaining lines', { lines })
              for (const line of lines) {
                processLine(line)
              }
            }
            break
          }

          const chunk = decoder.decode(value)
          buffer += chunk

          // Process complete lines (up to last newline)
          const lastNewline = buffer.lastIndexOf('\n')
          if (lastNewline === -1) continue

          const completeData = buffer.slice(0, lastNewline)
          buffer = buffer.slice(lastNewline + 1)

          const lines = completeData.split('\n')
          for (const line of lines) {
            processLine(line)
          }
        }
      } catch (error) {
        // Handle abort gracefully (user cancelled)
        if (error instanceof Error && error.name === 'AbortError') {
          log.assistant.debug('Stream aborted by user')
        } else {
          log.assistant.error('Error sending message', { error })
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
        streamReaderRef.current = null
        // Refresh session data to get persisted messages
        queryClient.invalidateQueries({ queryKey: ['assistant-session', chatId] })
        queryClient.invalidateQueries({ queryKey: ['assistant-artifacts', chatId] })
        queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      }
    },
    [chatId, model, isStreaming, queryClient, editorContent, saveEditorContentMutation]
  )

  // Stop streaming handler
  const handleStopStreaming = useCallback(() => {
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel().catch(() => {
        // Ignore cancellation errors
      })
      streamReaderRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
    log.assistant.info('Cancelled streaming response')
  }, [])

  // Auto-select first session if none selected
  useEffect(() => {
    if (sessionsData && !isLoadingSessions && !chatId) {
      if (sessionsData.sessions.length > 0) {
        setSelectedSessionId(sessionsData.sessions[0].id)
      }
    }
  }, [sessionsData, isLoadingSessions, chatId, setSelectedSessionId])

  const sessions = sessionsData?.sessions || []
  const artifacts = artifactsData?.artifacts || []
  const documents = documentsData?.documents || []

  return (
    <div className="h-[calc(100vh-40px)]">
      <AssistantLayout
        sessions={sessions}
        selectedSession={selectedSession || null}
        artifacts={artifacts}
        selectedArtifact={selectedArtifact}
        isLoading={isStreaming}
        provider={provider}
        model={model}
        opencodeModel={opencodeModel}
        opencodeProviders={opencodeProviders}
        isOpencodeAvailable={isOpencodeAvailable}
        editorContent={editorContent}
        canvasContent={canvasContent}
        documents={documents}
        canvasActiveTab={canvasActiveTab}
        onCanvasTabChange={setCanvasActiveTab}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
        onProviderChange={setProvider}
        onModelChange={setModel}
        onOpencodeModelChange={setOpencodeModel}
        onSelectSession={(session) => setSelectedSessionId(session.id)}
        onDeleteSession={(id) => deleteSessionMutation.mutate(id)}
        onUpdateSessionTitle={(id, title) => updateSessionTitleMutation.mutate({ id, title })}
        onSelectArtifact={setSelectedArtifact}
        onEditorContentChange={handleEditorContentChange}
        onSendMessage={handleSendMessage}
        onCreateSession={() => createSessionMutation.mutate()}
        onSelectDocument={handleSelectDocument}
        onStarDocument={(sessionId, starred) => starDocumentMutation.mutate({ sessionId, starred })}
        onRenameDocument={(sessionId, filename) => renameDocumentMutation.mutate({ sessionId, filename })}
        onStopStreaming={handleStopStreaming}
      />
    </div>
  )
}

export const Route = createFileRoute('/assistant/')({
  component: AssistantView,
  validateSearch: (search: Record<string, unknown>): { chat?: string; tab?: CanvasTab; panel?: MobilePanel } => {
    const validTabs: CanvasTab[] = ['viewer', 'editor', 'documents']
    const validPanels: MobilePanel[] = ['chat', 'canvas']
    const tab = typeof search.tab === 'string' && validTabs.includes(search.tab as CanvasTab)
      ? (search.tab as CanvasTab)
      : undefined
    const panel = typeof search.panel === 'string' && validPanels.includes(search.panel as MobilePanel)
      ? (search.panel as MobilePanel)
      : undefined
    return {
      chat: typeof search.chat === 'string' ? search.chat : undefined,
      tab,
      panel,
    }
  },
})
