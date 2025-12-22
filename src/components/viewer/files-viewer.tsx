import { useCallback, useState, useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useFileTree, useFileContent } from '@/hooks/use-filesystem'
import { useFilesViewState } from '@/hooks/use-files-view-state'
import { FileTree } from './file-tree'
import { FileContent } from './file-content'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

interface FilesViewerProps {
  taskId: string
  worktreePath: string | null
}

export function FilesViewer({ taskId, worktreePath }: FilesViewerProps) {
  const { selectedFile, expandedDirs, setSelectedFile, toggleDir, collapseAll } =
    useFilesViewState(taskId)
  const [mobileTab, setMobileTab] = useState<'tree' | 'content'>('tree')
  const isMobile = useIsMobile()

  const {
    data: treeData,
    isLoading: treeLoading,
    error: treeError,
  } = useFileTree(worktreePath)

  const {
    data: fileContent,
    isLoading: contentLoading,
    error: contentError,
  } = useFileContent(worktreePath, selectedFile)

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFile(path)
      // On mobile, switch to content tab when a file is selected
      if (window.matchMedia('(max-width: 639px)').matches) {
        setMobileTab('content')
      }
    },
    [setSelectedFile]
  )

  const handleCloseFile = useCallback(() => {
    setSelectedFile(null)
    // On mobile, switch back to tree tab when file is closed
    if (window.matchMedia('(max-width: 639px)').matches) {
      setMobileTab('tree')
    }
  }, [setSelectedFile])

  const handleToggleDir = useCallback(
    (path: string) => {
      toggleDir(path)
    },
    [toggleDir]
  )

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No worktree selected
      </div>
    )
  }

  if (treeLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading files...
      </div>
    )
  }

  if (treeError) {
    return (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        {treeError.message}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab(v as 'tree' | 'content')}
        className="flex h-full flex-col"
      >
        <div className="shrink-0 border-b border-border px-2 py-1">
          <TabsList className="w-full">
            <TabsTrigger value="tree" className="flex-1">Files</TabsTrigger>
            <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tree" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <FileTree
              entries={treeData?.entries || []}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={handleSelectFile}
              onToggleDir={handleToggleDir}
              onCollapseAll={collapseAll}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="content" className="flex-1 min-h-0 overflow-hidden">
          <FileContent
            filePath={selectedFile}
            content={fileContent ?? null}
            isLoading={contentLoading}
            error={contentError}
            onClose={handleCloseFile}
          />
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* File Content Panel */}
      <ResizablePanel defaultSize={65} minSize={30} className="overflow-hidden">
        <FileContent
          filePath={selectedFile}
          content={fileContent ?? null}
          isLoading={contentLoading}
          error={contentError}
          onClose={handleCloseFile}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* File Tree Panel */}
      <ResizablePanel defaultSize={35} minSize={15}>
        <ScrollArea className="h-full">
          <FileTree
            entries={treeData?.entries || []}
            selectedFile={selectedFile}
            expandedDirs={expandedDirs}
            onSelectFile={handleSelectFile}
            onToggleDir={handleToggleDir}
            onCollapseAll={collapseAll}
          />
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
