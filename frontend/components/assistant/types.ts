// Types for the Assistant feature

export interface ChatSession {
  id: string
  title: string
  provider: 'claude' | 'opencode'
  model: string | null
  worktreePath: string
  branch: string
  devPort: number | null
  projectId: string | null
  context: string | null
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
  type: 'react' | 'chart' | 'mermaid' | 'markdown' | 'code'
  title: string
  description: string | null
  version: number
  previewPath: string | null
  contentPath: string
  isFavorite: boolean
  tags: string | null
  createdAt: string
  updatedAt: string
  content?: string // Loaded on demand
}

export interface ArtifactWithContent extends Artifact {
  content: string
}
