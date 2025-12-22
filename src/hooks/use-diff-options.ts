import { useCallback } from 'react'
import { useTaskViewState } from './use-task-view-state'
import type { DiffOptions } from '@/types'

/**
 * Persists diff viewer options per task in the backend.
 */
export function useDiffOptions(taskId: string) {
  const { viewState, setDiffOptions } = useTaskViewState(taskId)
  const { collapsedFiles } = viewState.diffOptions

  const toggleFileCollapse = useCallback(
    (path: string) => {
      const isCollapsed = collapsedFiles.includes(path)
      setDiffOptions({
        collapsedFiles: isCollapsed
          ? collapsedFiles.filter((f) => f !== path)
          : [...collapsedFiles, path],
      })
    },
    [collapsedFiles, setDiffOptions]
  )

  const collapseAll = useCallback(
    (filePaths: string[]) => {
      setDiffOptions({ collapsedFiles: filePaths })
    },
    [setDiffOptions]
  )

  const expandAll = useCallback(() => {
    setDiffOptions({ collapsedFiles: [] })
  }, [setDiffOptions])

  const isFileCollapsed = useCallback(
    (path: string) => collapsedFiles.includes(path),
    [collapsedFiles]
  )

  return {
    options: viewState.diffOptions,
    setOption: <K extends keyof DiffOptions>(key: K, value: DiffOptions[K]) => {
      setDiffOptions({ [key]: value })
    },
    setOptions: setDiffOptions,
    toggleFileCollapse,
    collapseAll,
    expandAll,
    isFileCollapsed,
  }
}
