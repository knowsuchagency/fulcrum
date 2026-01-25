import { useCallback, createContext, useContext } from 'react'
import { observer } from 'mobx-react-lite'
import {
  FilesStoreContext,
  useCreateFilesStore,
  useFilesStoreActions,
} from '@/stores'
import { useFileTreePolling } from '@/hooks/use-file-tree-polling'
import { FileTree } from './file-tree'
import { FileContent } from './file-content'

interface FilesViewerProps {
  worktreePath: string | null
  readOnly?: boolean
  initialSelectedFile?: string | null
  onFileChange?: (file: string | null) => void
  onFileSaved?: (file: string) => void
}

// Context to pass callbacks to inner components
interface FilesViewerCallbacks {
  onFileChange?: (file: string | null) => void
  onFileSaved?: (file: string) => void
}
const CallbacksContext = createContext<FilesViewerCallbacks>({})

// Export context for FileContent to access onFileSaved
export { CallbacksContext }

/**
 * Inner component that uses the files store context
 */
const FilesViewerInner = observer(function FilesViewerInner() {
  const { onFileChange } = useContext(CallbacksContext)
  const {
    worktreePath,
    selectedFile,
    expandedDirs,
    fileTree,
    isLoadingTree,
    treeError,
    selectFile,
    loadFile,
    toggleDir,
    collapseAll,
    updateFileTree,
  } = useFilesStoreActions()

  // Poll for file tree changes (files added/removed externally)
  useFileTreePolling({
    worktreePath,
    currentTree: fileTree,
    onTreeChanged: updateFileTree,
    enabled: !isLoadingTree,
  })

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
      <div className="flex h-full flex-col" style={{ background: 'var(--gradient-card)' }}>
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
  onFileSaved,
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
      <CallbacksContext.Provider value={{ onFileChange, onFileSaved }}>
        <FilesViewerInner />
      </CallbacksContext.Provider>
    </FilesStoreContext.Provider>
  )
}
