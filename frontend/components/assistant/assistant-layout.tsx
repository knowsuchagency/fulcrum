import { MessageSquare, Layout } from 'lucide-react'
import { ChatPanel, type ImageAttachment } from './chat-panel'
import { CanvasPanel } from './canvas-panel'
import type { ChatSession, Artifact, Document } from './types'
import type { AgentType } from '../../../shared/types'

export type ClaudeModelId = 'opus' | 'sonnet' | 'haiku'
export type MobilePanel = 'chat' | 'canvas'

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
  documents: Document[]
  canvasActiveTab?: 'viewer' | 'editor' | 'documents'
  onCanvasTabChange?: (tab: 'viewer' | 'editor' | 'documents') => void
  mobileView?: MobilePanel
  onMobileViewChange?: (view: MobilePanel) => void
  onProviderChange: (provider: AgentType) => void
  onModelChange: (model: ClaudeModelId) => void
  onOpencodeModelChange: (model: string) => void
  onSelectSession: (session: ChatSession) => void
  onDeleteSession: (id: string) => void
  onUpdateSessionTitle: (id: string, title: string) => void
  onSelectArtifact: (artifact: Artifact | null) => void
  onEditorContentChange: (content: string) => void
  onSendMessage: (message: string, images?: ImageAttachment[]) => void
  onCreateSession: () => void
  onSelectDocument: (doc: Document) => void
  onStarDocument: (sessionId: string, starred: boolean) => void
  onRenameDocument: (sessionId: string, newFilename: string) => void
  onStopStreaming?: () => void
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
  documents,
  canvasActiveTab,
  onCanvasTabChange,
  mobileView = 'chat',
  onMobileViewChange,
  onProviderChange,
  onModelChange,
  onOpencodeModelChange,
  onSelectSession,
  onDeleteSession,
  onUpdateSessionTitle,
  onSelectArtifact,
  onEditorContentChange,
  onSendMessage,
  onCreateSession,
  onSelectDocument,
  onStarDocument,
  onRenameDocument,
  onStopStreaming,
}: AssistantLayoutProps) {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Mobile Tab Bar - visible only on mobile */}
      <div className="md:hidden flex border-b border-border bg-muted/30">
        <button
          onClick={() => onMobileViewChange?.('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileView === 'chat'
              ? 'text-foreground border-b-2 border-accent bg-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
        <button
          onClick={() => onMobileViewChange?.('canvas')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            mobileView === 'canvas'
              ? 'text-foreground border-b-2 border-accent bg-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layout className="w-4 h-4" />
          Canvas
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Chat (1/3 width on desktop, full width on mobile when active) */}
        <div className={`h-full border-r border-border md:block md:w-1/3 md:min-w-[300px] md:max-w-[500px] ${
          mobileView === 'chat' ? 'flex-1' : 'hidden'
        }`}>
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
            onUpdateSessionTitle={onUpdateSessionTitle}
            onStopStreaming={onStopStreaming}
          />
        </div>

        {/* Right Panel - Canvas (2/3 width on desktop, full width on mobile when active) */}
        <div className={`h-full md:block md:flex-1 ${
          mobileView === 'canvas' ? 'flex-1' : 'hidden'
        }`}>
          <CanvasPanel
            session={selectedSession}
            artifacts={artifacts}
            selectedArtifact={selectedArtifact}
            onSelectArtifact={onSelectArtifact}
            editorContent={editorContent}
            onEditorContentChange={onEditorContentChange}
            canvasContent={canvasContent}
            documents={documents}
            onSelectDocument={onSelectDocument}
            onStarDocument={onStarDocument}
            onRenameDocument={onRenameDocument}
            activeTab={canvasActiveTab}
            onTabChange={onCanvasTabChange}
          />
        </div>
      </div>
    </div>
  )
}
