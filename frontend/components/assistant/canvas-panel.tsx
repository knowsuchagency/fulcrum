import { useState, useEffect } from 'react'
import { Code2, LayoutGrid, Eye, Edit3, Star, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatSession, Artifact } from './types'

interface CanvasPanelProps {
  session: ChatSession | null
  artifacts: Artifact[]
  selectedArtifact: Artifact | null
  onSelectArtifact: (artifact: Artifact | null) => void
}

export function CanvasPanel({
  session,
  artifacts,
  selectedArtifact,
  onSelectArtifact,
}: CanvasPanelProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'editor' | 'gallery'>('preview')

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <Code2 className="size-16 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Select a chat to view artifacts</p>
          <p className="text-xs mt-1">Generated components, charts, and diagrams will appear here</p>
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
            <TabsTrigger value="preview" className="gap-1.5 text-xs">
              <Eye className="size-3" />
              Preview
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
        <TabsContent value="preview" className="flex-1 m-0 data-[state=inactive]:hidden">
          {selectedArtifact ? (
            <ArtifactPreview artifact={selectedArtifact} />
          ) : (
            <SandboxPreview session={session} />
          )}
        </TabsContent>

        <TabsContent value="editor" className="flex-1 m-0 data-[state=inactive]:hidden">
          <ArtifactEditor artifact={selectedArtifact} />
        </TabsContent>

        <TabsContent value="gallery" className="flex-1 m-0 data-[state=inactive]:hidden">
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

interface SandboxPreviewProps {
  session: ChatSession
}

function SandboxPreview({ session }: SandboxPreviewProps) {
  const [iframeKey, setIframeKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRestarting, setIsRestarting] = useState(false)
  const [actualPort, setActualPort] = useState<number | null>(session.devPort)
  const [serverStatus, setServerStatus] = useState<'unknown' | 'running' | 'stopped'>('unknown')

  // Check server status and get actual port on mount and when session changes
  useEffect(() => {
    let mounted = true

    const checkServerStatus = async () => {
      try {
        const res = await fetch(`/api/assistant/sessions/${session.id}/dev-server`)
        if (!res.ok) return

        const data = await res.json()
        if (mounted) {
          setServerStatus(data.running ? 'running' : 'stopped')
          if (data.port) {
            setActualPort(data.port)
          }
        }
      } catch {
        // Ignore errors
      }
    }

    checkServerStatus()
    return () => { mounted = false }
  }, [session.id])

  const handleRefresh = () => {
    setIsLoading(true)
    setIframeKey((k) => k + 1)
  }

  const handleRestart = async () => {
    setIsRestarting(true)
    try {
      const res = await fetch(`/api/assistant/sessions/${session.id}/dev-server/restart`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setActualPort(data.port)
        setServerStatus('running')
        setIsLoading(true)
        setIframeKey((k) => k + 1)
      }
    } catch {
      // Ignore errors
    } finally {
      setIsRestarting(false)
    }
  }

  const handleOpenExternal = () => {
    if (actualPort) {
      window.open(`http://localhost:${actualPort}`, '_blank')
    }
  }

  const port = actualPort || session.devPort

  if (!port) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Loader2 className="size-12 mx-auto mb-4 opacity-40 animate-spin" />
          <p className="text-sm">Starting preview server...</p>
          <p className="text-xs mt-1">This may take a moment on first load</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Preview Header */}
      <div className="px-4 py-2 border-b border-border bg-background/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "size-2 rounded-full",
            serverStatus === 'running' ? "bg-green-500 animate-pulse" :
            serverStatus === 'stopped' ? "bg-red-500" :
            "bg-yellow-500"
          )} />
          <span className="text-xs text-muted-foreground">localhost:{port}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            disabled={isRestarting}
          >
            <RefreshCw className={cn("size-3.5", isRestarting && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleOpenExternal}>
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Iframe Container */}
      <div className="flex-1 relative">
        {(isLoading || isRestarting) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          key={iframeKey}
          src={`http://localhost:${port}`}
          className="w-full h-full border-0 bg-white"
          title="Sandbox Preview"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            // If iframe fails to load, try restarting the server
            if (serverStatus !== 'running') {
              handleRestart()
            }
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  )
}

interface ArtifactPreviewProps {
  artifact: Artifact | null
}

function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  if (!artifact) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Eye className="size-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">No artifact selected</p>
          <p className="text-xs mt-1">Select an artifact from the gallery to preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Artifact Info */}
      <div className="px-4 py-2 border-b border-border bg-background/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">{artifact.title}</h4>
            <p className="text-xs text-muted-foreground capitalize">{artifact.type}</p>
          </div>
          <div className="text-xs text-muted-foreground">
            v{artifact.version}
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 p-4">
        <div className="h-full rounded-lg border border-border bg-background overflow-hidden">
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <Code2 className="size-8 mx-auto mb-2 opacity-40" />
              <p>Artifact preview</p>
              <p className="text-xs mt-1">Type: {artifact.type}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ArtifactEditorProps {
  artifact: Artifact | null
}

function ArtifactEditor({ artifact }: ArtifactEditorProps) {
  if (!artifact) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Edit3 className="size-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">No artifact selected</p>
          <p className="text-xs mt-1">Select an artifact to edit its code</p>
        </div>
      </div>
    )
  }

  // For now, show a placeholder. Monaco editor will be integrated later.
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-background/50">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Editing: {artifact.title}</div>
          <div className="text-xs text-muted-foreground">
            {artifact.type === 'react' ? 'component.tsx' : artifact.type === 'chart' ? 'config.json' : 'content.txt'}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="h-full rounded-lg border border-border bg-background font-mono text-sm overflow-auto">
          <pre className="p-4 text-muted-foreground">
            {artifact.content || '// Loading content...'}
          </pre>
        </div>
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
          <p className="text-xs mt-1">Artifacts created during the chat will appear here</p>
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
    react: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    chart: 'bg-green-500/10 text-green-500 border-green-500/20',
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
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] border', typeColors[artifact.type])}>
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
