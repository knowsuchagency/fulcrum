import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'

const DEFAULT_URL = 'http://localhost:5173'

/**
 * Uses TanStack Query's cache as a client-side state store for browser URLs.
 * This persists the URL across navigation without needing additional dependencies.
 */
export function useBrowserUrl(taskId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['browser-url', taskId]

  // Subscribe to cache changes for this specific key
  const subscribe = useCallback(
    (callback: () => void) => {
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey[0] === 'browser-url' &&
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
    return queryClient.getQueryData<string>(queryKey) ?? DEFAULT_URL
  }, [queryClient, queryKey])

  const url = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setUrl = useCallback(
    (newUrl: string) => {
      queryClient.setQueryData(queryKey, newUrl)
    },
    [queryClient, queryKey]
  )

  return { url, setUrl }
}
