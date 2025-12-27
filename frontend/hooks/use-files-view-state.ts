import { useCallback } from 'react'
import { useTaskViewState } from './use-task-view-state'

export function useFilesViewState(taskId: string) {
  const { viewState, setFilesViewState } = useTaskViewState(taskId)

  const filesViewState = viewState.filesViewState ?? {
    selectedFile: null,
    expandedDirs: [],
  }

  const setSelectedFile = useCallback(
    (path: string | null) => {
      setFilesViewState({ selectedFile: path })
    },
    [setFilesViewState]
  )

  const toggleDir = useCallback(
    (path: string) => {
      const isExpanded = filesViewState.expandedDirs.includes(path)
      const newExpandedDirs = isExpanded
        ? filesViewState.expandedDirs.filter((p) => p !== path)
        : [...filesViewState.expandedDirs, path]
      setFilesViewState({ expandedDirs: newExpandedDirs })
    },
    [filesViewState.expandedDirs, setFilesViewState]
  )

  const collapseAll = useCallback(() => {
    setFilesViewState({ expandedDirs: [] })
  }, [setFilesViewState])

  return {
    selectedFile: filesViewState.selectedFile,
    expandedDirs: filesViewState.expandedDirs,
    setSelectedFile,
    toggleDir,
    collapseAll,
  }
}
