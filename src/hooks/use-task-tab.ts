import { useTaskViewState } from './use-task-view-state'

/**
 * Persists the active tab (diff/browser) per task in the backend.
 */
export function useTaskTab(taskId: string) {
  const { viewState, setActiveTab } = useTaskViewState(taskId)

  return {
    tab: viewState.activeTab,
    setTab: setActiveTab,
  }
}
