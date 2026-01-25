// Types for the Assistant feature

export interface ChatSession {
  id: string
  title: string
  provider: 'claude' | 'opencode'
  model: string | null
  projectId: string | null
  context: string | null
  editorContent: string | null
  isFavorite: boolean
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls: string | null
  artifacts: string | null
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  createdAt: string
}

export interface Artifact {
  id: string
  sessionId: string | null
  messageId: string | null
  type: 'chart' | 'mermaid' | 'markdown' | 'code'
  title: string
  description: string | null
  content: string | null
  version: number
  previewUrl: string | null
  isFavorite: boolean
  tags: string | null
  createdAt: string
  updatedAt: string
}

export interface ArtifactWithContent extends Artifact {
  content: string
}
