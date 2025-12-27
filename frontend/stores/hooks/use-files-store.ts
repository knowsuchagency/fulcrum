import { createContext, useContext, useEffect, useMemo } from 'react'
import { createFilesStore, type IFilesStore } from '../files-store'

/**
 * Context for the files store
 * Unlike the terminal store which is global, the files store is scoped per FilesViewer instance
 */
export const FilesStoreContext = createContext<IFilesStore | null>(null)

/**
 * Create a files store for a specific worktree
 */
export function useCreateFilesStore(worktreePath: string | null): IFilesStore {
  const store = useMemo(() => createFilesStore(), [])

  useEffect(() => {
    store.setWorktreePath(worktreePath)
    if (worktreePath) {
      store.loadFileTree()
    }
  }, [store, worktreePath])

  return store
}

/**
 * Hook to access the files store from within a FilesStoreProvider
 */
export function useFilesStore(): IFilesStore {
  const store = useContext(FilesStoreContext)
  if (!store) {
    throw new Error('useFilesStore must be used within a FilesStoreProvider')
  }
  return store
}

/**
 * Return type for useFilesStoreActions - provides commonly used actions and state
 */
export interface UseFilesStoreReturn {
  // State
  selectedFile: string | null
  currentFile: ReturnType<IFilesStore['currentFile']>
  expandedDirs: string[]
  fileTree: ReturnType<IFilesStore['fileTree']>
  isLoading: boolean
  isSaving: boolean
  isLoadingTree: boolean
  loadError: string | null
  saveError: string | null
  treeError: string | null
  isDirty: boolean

  // Actions
  selectFile: (path: string | null) => void
  loadFile: (path: string) => Promise<void>
  saveFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  updateContent: (path: string, content: string) => void
  toggleDir: (path: string) => void
  collapseAll: () => void
  toggleMarkdownView: (path: string) => void
  isFileMarkdownView: (path: string) => boolean
  isDirExpanded: (path: string) => boolean
  refreshTree: () => Promise<void>
}

/**
 * Hook that provides a stable interface to the files store
 * Similar pattern to useTerminalStore
 */
export function useFilesStoreActions(): UseFilesStoreReturn {
  const store = useFilesStore()

  return {
    // State (these are already observable via MST)
    selectedFile: store.selectedFile,
    currentFile: store.currentFile,
    expandedDirs: [...store.expandedDirs],
    fileTree: store.fileTree,
    isLoading: store.isLoading,
    isSaving: store.isSaving,
    isLoadingTree: store.isLoadingTree,
    loadError: store.loadError,
    saveError: store.saveError,
    treeError: store.treeError,
    isDirty: store.isDirty,

    // Actions
    selectFile: store.selectFile,
    loadFile: store.loadFile,
    saveFile: store.saveFile,
    closeFile: store.closeFile,
    updateContent: store.updateContent,
    toggleDir: store.toggleDir,
    collapseAll: store.collapseAll,
    toggleMarkdownView: store.toggleMarkdownView,
    isFileMarkdownView: store.isFileMarkdownView,
    isDirExpanded: store.isDirExpanded,
    refreshTree: store.loadFileTree,
  }
}
