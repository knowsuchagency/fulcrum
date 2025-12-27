import { useCallback, createContext, useContext } from 'react'
import { observer } from 'mobx-react-lite'
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
  initialSelectedFile?: string | null
  onFileChange?: (file: string | null) => void
}

// Context to pass onFileChange callback to inner component
const FileChangeContext = createContext<((file: string | null) => void) | undefined>(undefined)

/**
 * Inner component that uses the files store context
 */
const FilesViewerInner = observer(function FilesViewerInner() {
  const onFileChange = useContext(FileChangeContext)
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

  const handleSelectFile = useCallback(
    (path: string) => {
      selectFile(path)
      loadFile(path)
      onFileChange?.(path)
    },
    [selectFile, loadFile, onFileChange]
  )

  const handleToggleDir = useCallback(
    (path: string) => {
      toggleDir(path)
    },
    [toggleDir]
  )

  const handleBack = useCallback(() => {
    selectFile(null)
    onFileChange?.(null)
  }, [selectFile, onFileChange])

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

  // Show file content when a file is selected, otherwise show the tree
  if (selectedFile) {
    return (
      <div className="flex h-full flex-col bg-background">
        <FileContent onBack={handleBack} />
      </div>
    )
  }

  return (
    <FileTree
      entries={fileTree || []}
      selectedFile={selectedFile}
      expandedDirs={expandedDirs}
      onSelectFile={handleSelectFile}
      onToggleDir={handleToggleDir}
      onCollapseAll={collapseAll}
    />
  )
})

/**
 * FilesViewer component with its own MST store context
 */
export function FilesViewer({
  worktreePath,
  readOnly = false,
  initialSelectedFile,
  onFileChange,
}: FilesViewerProps) {
  const store = useCreateFilesStore(worktreePath, readOnly, initialSelectedFile)

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No worktree selected
      </div>
    )
  }

  return (
    <FilesStoreContext.Provider value={store}>
      <FileChangeContext.Provider value={onFileChange}>
        <FilesViewerInner />
      </FileChangeContext.Provider>
    </FilesStoreContext.Provider>
  )
}
