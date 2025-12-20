import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

const DEFAULT_TAB = 'diff'

/**
 * Uses TanStack Query's cache to persist the active tab (diff/browser) per task.
 */
export function useTaskTab(taskId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['task-tab', taskId]

  const subscribe = useCallback(
    (callback: () => void) => {
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey[0] === 'task-tab' &&
          event.query.queryKey[1] === taskId
        ) {
          callback()
        }
      })
      return unsubscribe
    },
    [queryClient, taskId]
  )

  const getSnapshot = useCallback(() => {
    return queryClient.getQueryData<string>(queryKey) ?? DEFAULT_TAB
  }, [queryClient, queryKey])

  const tab = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setTab = useCallback(
    (newTab: string) => {
      queryClient.setQueryData(queryKey, newTab)
    },
    [queryClient, queryKey]
  )

  return { tab, setTab }
}
