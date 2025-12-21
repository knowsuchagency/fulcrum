import { useCallback } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFileTree, useFileContent } from '@/hooks/use-filesystem'
import { useFilesViewState } from '@/hooks/use-files-view-state'
import { FileTree } from './file-tree'
import { FileContent } from './file-content'

interface FilesViewerProps {
  taskId: string
  worktreePath: string | null
}

export function FilesViewer({ taskId, worktreePath }: FilesViewerProps) {
  const { selectedFile, expandedDirs, setSelectedFile, toggleDir, collapseAll } =
    useFilesViewState(taskId)

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
    },
    [setSelectedFile]
  )

  const handleCloseFile = useCallback(() => {
    setSelectedFile(null)
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
