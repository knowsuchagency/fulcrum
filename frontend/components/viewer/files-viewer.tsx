import { useCallback, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarLeft01Icon } from '@hugeicons/core-free-icons'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-is-mobile'
import {
  FilesStoreContext,
  useCreateFilesStore,
  useFilesStoreActions,
} from '@/stores'
import { FileTree } from './file-tree'
import { FileContent } from './file-content'

interface FilesViewerProps {
  worktreePath: string | null
  readOnly?: boolean
}

/**
 * Inner component that uses the files store context
 */
const FilesViewerInner = observer(function FilesViewerInner() {
  const {
    selectedFile,
    expandedDirs,
    fileTree,
    isLoadingTree,
    treeError,
    selectFile,
    loadFile,
    toggleDir,
    collapseAll,
  } = useFilesStoreActions()

  const [mobileTab, setMobileTab] = useState<'tree' | 'content'>('tree')
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false)
  const isMobile = useIsMobile()

  const handleSelectFile = useCallback(
    (path: string) => {
      selectFile(path)
      loadFile(path)
      // On mobile, switch to content tab when a file is selected
      if (window.matchMedia('(max-width: 639px)').matches) {
        setMobileTab('content')
      }
    },
    [selectFile, loadFile]
  )

  const handleToggleDir = useCallback(
    (path: string) => {
      toggleDir(path)
    },
    [toggleDir]
  )

  const handleCollapsePanel = useCallback(() => {
    setIsTreeCollapsed(true)
  }, [])

  const handleExpandPanel = useCallback(() => {
    setIsTreeCollapsed(false)
  }, [])

  if (isLoadingTree) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading files...
      </div>
    )
  }

  if (treeError) {
    return (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        {treeError}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab(v as 'tree' | 'content')}
        className="flex h-full flex-col bg-background"
      >
        <div className="shrink-0 border-b border-border bg-card px-2 py-1">
          <TabsList className="w-full">
            <TabsTrigger value="tree" className="flex-1">
              Files
            </TabsTrigger>
            <TabsTrigger value="content" className="flex-1">
              Content
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tree" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <FileTree
              entries={fileTree || []}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={handleSelectFile}
              onToggleDir={handleToggleDir}
              onCollapseAll={collapseAll}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="content" className="flex-1 min-h-0 overflow-hidden">
          <FileContent />
        </TabsContent>
      </Tabs>
    )
  }

  // Desktop: collapsed tree panel
  if (isTreeCollapsed) {
    return (
      <div className="flex h-full bg-background">
        {/* File Content - full width */}
        <div className="flex-1 overflow-hidden">
          <FileContent />
        </div>

        {/* Expand button strip */}
        <div className="shrink-0 border-l border-border bg-card flex flex-col">
          <div className="p-1 border-b border-border">
            <button
              onClick={handleExpandPanel}
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
              title="Show file tree"
            >
              <HugeiconsIcon icon={SidebarLeft01Icon} size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Desktop: normal view with tree panel
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full bg-background">
      {/* File Content Panel */}
      <ResizablePanel defaultSize={65} minSize={30} className="overflow-hidden">
        <FileContent />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* File Tree Panel */}
      <ResizablePanel defaultSize={35} minSize={15}>
        <ScrollArea className="h-full">
          <FileTree
            entries={fileTree || []}
            selectedFile={selectedFile}
            expandedDirs={expandedDirs}
            onSelectFile={handleSelectFile}
            onToggleDir={handleToggleDir}
            onCollapseAll={collapseAll}
            onCollapsePanel={handleCollapsePanel}
          />
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
})

/**
 * FilesViewer component with its own MST store context
 */
export function FilesViewer({ worktreePath, readOnly = false }: FilesViewerProps) {
  const store = useCreateFilesStore(worktreePath, readOnly)

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No worktree selected
      </div>
    )
  }

  return (
    <FilesStoreContext.Provider value={store}>
      <FilesViewerInner />
    </FilesStoreContext.Provider>
  )
}
