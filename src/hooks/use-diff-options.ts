import { useTaskViewState } from './use-task-view-state'
import type { DiffOptions } from '@/types'

/**
 * Persists diff viewer options per task in the backend.
 */
export function useDiffOptions(taskId: string) {
  const { viewState, setDiffOptions } = useTaskViewState(taskId)

  return {
    options: viewState.diffOptions,
    setOption: <K extends keyof DiffOptions>(key: K, value: DiffOptions[K]) => {
      setDiffOptions({ [key]: value })
    },
    setOptions: setDiffOptions,
  }
}
