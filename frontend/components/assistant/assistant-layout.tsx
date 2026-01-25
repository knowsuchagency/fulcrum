import { ChatPanel } from './chat-panel'
import { CanvasPanel } from './canvas-panel'
import type { ChatSession, Artifact } from './types'
import type { AgentType } from '../../../shared/types'

export type ClaudeModelId = 'opus' | 'sonnet' | 'haiku'

export interface CreateSessionOptions {
  provider: AgentType
  model: string
}

interface AssistantLayoutProps {
  sessions: ChatSession[]
  selectedSession: ChatSession | null
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  isLoading: boolean
  provider: AgentType
  model: ClaudeModelId
  opencodeModel: string | null
  opencodeProviders: Record<string, string[]>
  isOpencodeAvailable: boolean
  editorContent: string
  canvasContent: string | null
  onProviderChange: (provider: AgentType) => void
  onModelChange: (model: ClaudeModelId) => void
  onOpencodeModelChange: (model: string) => void
  onSelectSession: (session: ChatSession) => void
  onDeleteSession: (id: string) => void
  onSelectArtifact: (artifact: Artifact | null) => void
  onEditorContentChange: (content: string) => void
  onSendMessage: (message: string) => void
  onCreateSession: () => void
}

export function AssistantLayout({
  sessions,
  selectedSession,
  artifacts,
  selectedArtifact,
  isLoading,
  provider,
  model,
  opencodeModel,
  opencodeProviders,
  isOpencodeAvailable,
  editorContent,
  canvasContent,
  onProviderChange,
  onModelChange,
  onOpencodeModelChange,
  onSelectSession,
  onDeleteSession,
  onSelectArtifact,
  onEditorContentChange,
  onSendMessage,
  onCreateSession,
}: AssistantLayoutProps) {
  return (
    <div className="h-full w-full flex">
      {/* Left Panel - Chat (1/3 width) */}
      <div className="w-1/3 min-w-[300px] max-w-[500px] h-full border-r border-border">
        <ChatPanel
          sessions={sessions}
          session={selectedSession}
          isLoading={isLoading}
          provider={provider}
          model={model}
          opencodeModel={opencodeModel}
          opencodeProviders={opencodeProviders}
          isOpencodeAvailable={isOpencodeAvailable}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onOpencodeModelChange={onOpencodeModelChange}
          onSendMessage={onSendMessage}
          onSelectSession={onSelectSession}
          onCreateSession={onCreateSession}
          onDeleteSession={onDeleteSession}
        />
      </div>

      {/* Right Panel - Canvas (2/3 width) */}
      <div className="flex-1 h-full">
        <CanvasPanel
          session={selectedSession}
          artifacts={artifacts}
          selectedArtifact={selectedArtifact}
          onSelectArtifact={onSelectArtifact}
          editorContent={editorContent}
          onEditorContentChange={onEditorContentChange}
          canvasContent={canvasContent}
        />
      </div>
    </div>
  )
}
