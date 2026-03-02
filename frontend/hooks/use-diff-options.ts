import { useCallback, useMemo } from 'react'
import { useTaskViewState } from './use-task-view-state'
import type { DiffOptions } from '@/types'

/**
 * Persists diff viewer options per task in the backend.
 */
export function useDiffOptions(taskId: string) {
  const { viewState, setDiffOptions } = useTaskViewState(taskId)
  const { collapsedFiles } = viewState.diffOptions

  const collapsedSet = useMemo(() => new Set(collapsedFiles), [collapsedFiles])

  const toggleFileCollapse = useCallback(
    (path: string) => {
      const next = new Set(collapsedSet)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      setDiffOptions({ collapsedFiles: [...next] })
    },
    [collapsedSet, setDiffOptions]
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
    (path: string) => collapsedSet.has(path),
    [collapsedSet]
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
