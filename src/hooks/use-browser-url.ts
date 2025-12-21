import { useTaskViewState } from './use-task-view-state'

/**
 * Persists the browser URL per task in the backend.
 */
export function useBrowserUrl(taskId: string) {
  const { viewState, setBrowserUrl } = useTaskViewState(taskId)

  return {
    url: viewState.browserUrl,
    setUrl: setBrowserUrl,
  }
}
