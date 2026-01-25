import { useState, useMemo } from 'react'
import { Code2, LayoutGrid, Eye, Edit3, Star } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ContentRenderer } from './content-renderer'
import { MarkdownEditor } from './markdown-editor'
import type { ChatSession, Artifact, ChatMessage } from './types'

interface CanvasPanelProps {
  session: ChatSession | null
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  onSelectArtifact: (artifact: Artifact | null) => void
}

/**
 * Extract canvas content from the last assistant message
 * Looks for vega-lite blocks that should be rendered in the viewer
 */
function extractCanvasContent(messages?: ChatMessage[]): string | null {
  if (!messages?.length) return null

  // Find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.content) {
      // Check if it has vega-lite content
      if (msg.content.includes('```vega-lite')) {
        return msg.content
      }
    }
  }

  return null
}

export function CanvasPanel({
  session,
  artifacts,
  selectedArtifact,
  onSelectArtifact,
}: CanvasPanelProps) {
  const [activeTab, setActiveTab] = useState<'viewer' | 'editor' | 'gallery'>('viewer')
  const [editorContent, setEditorContent] = useState('')

  // Get canvas content from the latest message with vega-lite blocks
  const canvasContent = useMemo(
    () => extractCanvasContent(session?.messages),
    [session?.messages]
  )

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
              Viewer
            </TabsTrigger>
            <TabsTrigger value="editor" className="gap-1.5 text-xs">
              <Edit3 className="size-3" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="gallery" className="gap-1.5 text-xs">
              <LayoutGrid className="size-3" />
              Gallery
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
            onChange={setEditorContent}
          />
        </TabsContent>

        <TabsContent value="gallery" className="flex-1 m-0 data-[state=inactive]:hidden overflow-hidden">
          <ArtifactGallery
            artifacts={artifacts}
            selectedArtifact={selectedArtifact}
            onSelectArtifact={onSelectArtifact}
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
          <p className="text-sm">No content to display</p>
          <p className="text-xs mt-1">Ask the assistant to create a chart or visualization</p>
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
          initialContent={content}
          onChange={onChange}
          placeholder="Start writing your document..."
        />
      </div>
    </div>
  )
}

interface ArtifactGalleryProps {
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  onSelectArtifact: (artifact: Artifact | null) => void
}

function ArtifactGallery({ artifacts, selectedArtifact, onSelectArtifact }: ArtifactGalleryProps) {
  if (artifacts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <LayoutGrid className="size-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">No artifacts yet</p>
          <p className="text-xs mt-1">Charts and visualizations will be saved here</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {artifacts.map((artifact) => (
          <ArtifactCard
            key={artifact.id}
            artifact={artifact}
            isSelected={selectedArtifact?.id === artifact.id}
            onSelect={() => onSelectArtifact(artifact)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

interface ArtifactCardProps {
  artifact: Artifact
  isSelected: boolean
  onSelect: () => void
}

function ArtifactCard({ artifact, isSelected, onSelect }: ArtifactCardProps) {
  const typeColors: Record<string, string> = {
    'vega-lite': 'bg-green-500/10 text-green-500 border-green-500/20',
    mermaid: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    markdown: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    code: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg border bg-card overflow-hidden cursor-pointer transition-all',
        isSelected
          ? 'ring-2 ring-accent border-accent'
          : 'hover:border-border/80 hover:shadow-md'
      )}
    >
      {/* Preview Thumbnail */}
      <div className="aspect-video bg-muted/50 flex items-center justify-center">
        <Code2 className="size-8 text-muted-foreground/30" />
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h5 className="text-xs font-medium truncate">{artifact.title}</h5>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] border', typeColors[artifact.type] || typeColors.code)}>
                {artifact.type}
              </span>
              <span className="text-[10px] text-muted-foreground">v{artifact.version}</span>
            </div>
          </div>

          {artifact.isFavorite && (
            <Star className="size-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  )
}
