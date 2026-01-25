import { useState, useCallback, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AssistantLayout, type ClaudeModelId } from '@/components/assistant'
import type { ChatSession, ChatMessage, Artifact } from '@/components/assistant'
import type { AgentType } from '../../../shared/types'

interface SessionsResponse {
  sessions: ChatSession[]
  total: number
}

interface ArtifactsResponse {
  artifacts: Artifact[]
  total: number
}

interface SessionWithMessages extends ChatSession {
  messages: ChatMessage[]
}

function AssistantView() {
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [provider, setProvider] = useState<AgentType>('claude')
  const [model, setModel] = useState<ClaudeModelId>('opus')

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
    queryKey: ['assistant-session', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) throw new Error('No session selected')
      const res = await fetch(`/api/assistant/sessions/${selectedSessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      return res.json()
    },
    enabled: !!selectedSessionId,
  })

  // Fetch artifacts for selected session
  const { data: artifactsData } = useQuery<ArtifactsResponse>({
    queryKey: ['assistant-artifacts', selectedSessionId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedSessionId) params.set('sessionId', selectedSessionId)
      const res = await fetch(`/api/assistant/artifacts?${params}`)
      if (!res.ok) throw new Error('Failed to fetch artifacts')
      return res.json()
    },
    enabled: !!selectedSessionId,
  })

  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/assistant/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Chat',
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
      queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      setSelectedSessionId(session.id)
    },
    onError: (error) => {
      console.error('Failed to create session:', error)
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
      if (selectedSessionId) {
        setSelectedSessionId(null)
      }
    },
  })

  // Send message handler
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!selectedSessionId || isStreaming) return

      setIsStreaming(true)

      // Optimistically add user message
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        sessionId: selectedSessionId,
        role: 'user',
        content: message,
        toolCalls: null,
        artifacts: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData<SessionWithMessages>(
        ['assistant-session', selectedSessionId],
        (old) => {
          if (!old) return old
          return { ...old, messages: [...old.messages, userMessage] }
        }
      )

      // Use current model from state
      const currentModel = model

      try {
        const response = await fetch(`/api/assistant/sessions/${selectedSessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            model: currentModel,
          }),
        })

        if (!response.ok) throw new Error('Failed to send message')

        // Create EventSource for SSE
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let assistantContent = ''
        let currentEventType = ''

        // Add placeholder for assistant message
        const assistantMessage: ChatMessage = {
          id: `temp-assistant-${Date.now()}`,
          sessionId: selectedSessionId,
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
          ['assistant-session', selectedSessionId],
          (old) => {
            if (!old) return old
            return { ...old, messages: [...old.messages, assistantMessage] }
          }
        )

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // Track event type for next data line
              currentEventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (currentEventType === 'content:delta' && data.text) {
                  assistantContent += data.text

                  // Update assistant message content
                  queryClient.setQueryData<SessionWithMessages>(
                    ['assistant-session', selectedSessionId],
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
                  // Invalidate artifacts query to refresh
                  queryClient.invalidateQueries({ queryKey: ['assistant-artifacts', selectedSessionId] })
                  // Auto-select first new artifact for preview
                  if (data.artifacts.length > 0) {
                    setSelectedArtifact(data.artifacts[0])
                  }
                } else if (!currentEventType && data.text) {
                  // Fallback for data without event type prefix
                  assistantContent += data.text

                  queryClient.setQueryData<SessionWithMessages>(
                    ['assistant-session', selectedSessionId],
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
        }
      } catch (error) {
        console.error('Error sending message:', error)
      } finally {
        setIsStreaming(false)
        // Refresh session data to get persisted messages
        queryClient.invalidateQueries({ queryKey: ['assistant-session', selectedSessionId] })
        queryClient.invalidateQueries({ queryKey: ['assistant-artifacts', selectedSessionId] })
        queryClient.invalidateQueries({ queryKey: ['assistant-sessions'] })
      }
    },
    [selectedSessionId, model, isStreaming, queryClient]
  )

  // Auto-select first session or create one if none exist
  useEffect(() => {
    if (sessionsData && !isLoadingSessions && !selectedSessionId) {
      if (sessionsData.sessions.length > 0) {
        setSelectedSessionId(sessionsData.sessions[0].id)
      }
    }
  }, [sessionsData, isLoadingSessions, selectedSessionId])

  const sessions = sessionsData?.sessions || []
  const artifacts = artifactsData?.artifacts || []

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
        onProviderChange={setProvider}
        onModelChange={setModel}
        onSelectSession={(session) => setSelectedSessionId(session.id)}
        onDeleteSession={(id) => deleteSessionMutation.mutate(id)}
        onSelectArtifact={setSelectedArtifact}
        onSendMessage={handleSendMessage}
        onCreateSession={() => createSessionMutation.mutate()}
      />
    </div>
  )
}

export const Route = createFileRoute('/assistant/')({
  component: AssistantView,
})
