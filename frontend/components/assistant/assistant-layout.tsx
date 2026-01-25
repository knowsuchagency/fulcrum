import { ChatPanel } from './chat-panel'
import { CanvasPanel } from './canvas-panel'
import type { ChatSession, Artifact } from './types'

interface AssistantLayoutProps {
  sessions: ChatSession[]
  selectedSession: ChatSession | null
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  isLoading: boolean
  onSelectSession: (session: ChatSession) => void
  onCreateSession: () => void
  onDeleteSession: (id: string) => void
  onSelectArtifact: (artifact: Artifact | null) => void
  onSendMessage: (message: string) => void
}

export function AssistantLayout({
  sessions,
  selectedSession,
  artifacts,
  selectedArtifact,
  isLoading,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onSelectArtifact,
  onSendMessage,
}: AssistantLayoutProps) {
  return (
    <div className="h-full w-full flex">
      {/* Left Panel - Chat (1/3 width) */}
      <div className="w-1/3 min-w-[300px] max-w-[500px] h-full border-r border-border">
        <ChatPanel
          sessions={sessions}
          session={selectedSession}
          isLoading={isLoading}
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
        />
      </div>
    </div>
  )
}
