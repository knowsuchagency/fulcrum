import { useState } from 'react'
import { Code2, FileText, Eye, Edit3, Star, Pencil, Check, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ContentRenderer } from './content-renderer'
import { MarkdownEditor } from './markdown-editor'
import type { ChatSession, Artifact, Document } from './types'
import { formatDistanceToNow } from 'date-fns'

interface CanvasPanelProps {
  session: ChatSession | null
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  onSelectArtifact: (artifact: Artifact | null) => void
  editorContent: string
  onEditorContentChange: (content: string) => void
  canvasContent: string | null
  documents: Document[]
  onSelectDocument: (doc: Document) => void
  onStarDocument: (sessionId: string, starred: boolean) => void
  onRenameDocument: (sessionId: string, newFilename: string) => void
  activeTab?: 'viewer' | 'editor' | 'documents'
  onTabChange?: (tab: 'viewer' | 'editor' | 'documents') => void
}

export function CanvasPanel({
  session,
  artifacts: _artifacts,
  selectedArtifact,
  onSelectArtifact: _onSelectArtifact,
  editorContent,
  onEditorContentChange,
  canvasContent,
  documents,
  onSelectDocument,
  onStarDocument,
  onRenameDocument,
  activeTab: controlledActiveTab,
  onTabChange,
}: CanvasPanelProps) {
  // Note: artifacts and onSelectArtifact kept for API compatibility but unused after Gallery removal
  void _artifacts
  void _onSelectArtifact
  const [internalActiveTab, setInternalActiveTab] = useState<'viewer' | 'editor' | 'documents'>('viewer')

  // Use controlled or internal state
  const activeTab = controlledActiveTab ?? internalActiveTab
  const setActiveTab = (tab: 'viewer' | 'editor' | 'documents') => {
    if (onTabChange) {
      onTabChange(tab)
    } else {
      setInternalActiveTab(tab)
    }
  }

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <Code2 className="size-16 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Select a chat to view the canvas</p>
          <p className="text-xs mt-1">Charts and visualizations will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-muted/20">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
        {/* Tab Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
          <TabsList className="h-8">
            <TabsTrigger value="viewer" className="gap-1.5 text-xs">
              <Eye className="size-3" />
              Canvas
            </TabsTrigger>
            <TabsTrigger value="editor" className="gap-1.5 text-xs">
              <Edit3 className="size-3" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs">
              <FileText className="size-3" />
              Documents
            </TabsTrigger>
          </TabsList>

          {selectedArtifact && (
            <div className="text-xs text-muted-foreground">
              {selectedArtifact.title}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <TabsContent value="viewer" className="flex-1 m-0 data-[state=inactive]:hidden overflow-hidden">
          <ViewerTab
            content={selectedArtifact?.content || canvasContent}
            artifact={selectedArtifact}
          />
        </TabsContent>

        <TabsContent value="editor" className="flex-1 m-0 data-[state=inactive]:hidden overflow-hidden">
          <EditorTab
            content={editorContent}
            onChange={onEditorContentChange}
          />
        </TabsContent>

        <TabsContent value="documents" className="flex-1 m-0 data-[state=inactive]:hidden overflow-hidden">
          <DocumentsTab
            documents={documents}
            onSelectDocument={onSelectDocument}
            onStarDocument={onStarDocument}
            onRenameDocument={onRenameDocument}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface ViewerTabProps {
  content: string | null
  artifact: Artifact | null
}

function ViewerTab({ content, artifact }: ViewerTabProps) {
  if (!content) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Eye className="size-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Canvas is empty</p>
          <p className="text-xs mt-1">Ask the assistant to show a chart, table, or visualization</p>
        </div>
      </div>
    )
  }

  // If this is an artifact with a known type, pass that info to ContentRenderer
  // Artifacts store raw content without markdown wrappers
  const contentType = artifact?.type || null

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        {artifact && (
          <div className="mb-4 pb-4 border-b border-border">
            <h4 className="text-sm font-medium">{artifact.title}</h4>
            {artifact.description && (
              <p className="text-xs text-muted-foreground mt-1">{artifact.description}</p>
            )}
          </div>
        )}
        <ContentRenderer content={content} contentType={contentType} />
      </div>
    </ScrollArea>
  )
}

interface EditorTabProps {
  content: string
  onChange: (content: string) => void
}

function EditorTab({ content, onChange }: EditorTabProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-background/50">
        <div className="text-xs text-muted-foreground">
          Document Editor - Write markdown with AI assistance
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          placeholder="Start writing your document..."
        />
      </div>
    </div>
  )
}

interface DocumentsTabProps {
  documents: Document[]
  onSelectDocument: (doc: Document) => void
  onStarDocument: (sessionId: string, starred: boolean) => void
  onRenameDocument: (sessionId: string, newFilename: string) => void
}

function DocumentsTab({
  documents,
  onSelectDocument,
  onStarDocument,
  onRenameDocument,
}: DocumentsTabProps) {
  if (documents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="size-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">No documents yet</p>
          <p className="text-xs mt-1">Documents created by AI will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.sessionId}
            document={doc}
            onSelect={() => onSelectDocument(doc)}
            onStar={(starred) => onStarDocument(doc.sessionId, starred)}
            onRename={(filename) => onRenameDocument(doc.sessionId, filename)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

interface DocumentCardProps {
  document: Document
  onSelect: () => void
  onStar: (starred: boolean) => void
  onRename: (filename: string) => void
}

function DocumentCard({ document, onSelect, onStar, onRename }: DocumentCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedFilename, setEditedFilename] = useState(document.filename)

  const handleSaveRename = () => {
    if (editedFilename && editedFilename !== document.filename) {
      onRename(editedFilename)
    }
    setIsEditing(false)
  }

  const handleCancelRename = () => {
    setEditedFilename(document.filename)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card p-3 transition-all',
        'hover:border-accent/50 hover:shadow-sm cursor-pointer'
      )}
      onClick={(e) => {
        // Don't trigger select when clicking on controls
        if ((e.target as HTMLElement).closest('button, input')) return
        onSelect()
      }}
    >
      <div className="flex items-start gap-3">
        <FileText className="size-5 text-muted-foreground mt-0.5 shrink-0" />

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editedFilename}
                onChange={(e) => setEditedFilename(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-6 text-xs py-0 px-1"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSaveRename()
                }}
              >
                <Check className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancelRename()
                }}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <h5 className="text-sm font-medium truncate">{document.filename}</h5>
              <Button
                size="icon"
                variant="ghost"
                className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditing(true)
                }}
              >
                <Pencil className="size-3" />
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {document.sessionTitle}
          </p>

          <p className="text-xs text-muted-foreground/70 mt-1">
            {formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}
          </p>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-6 shrink-0',
            document.starred
              ? 'text-yellow-500'
              : 'text-muted-foreground opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onStar(!document.starred)
          }}
        >
          <Star
            className={cn('size-4', document.starred && 'fill-yellow-500')}
          />
        </Button>
      </div>
    </div>
  )
}
