import { useEffect } from 'react'
import { useAutoScrollToBottom } from '@/hooks/use-config'
import { useStore } from '@/stores'

/**
 * Syncs the auto-scroll setting from React Query to the MST store.
 * This allows the terminal output handler to check the setting synchronously.
 */
export function useAutoScrollSync() {
  const { data: autoScrollToBottom, isLoading } = useAutoScrollToBottom()
  const store = useStore()

  useEffect(() => {
    if (!isLoading) {
      store.setAutoScrollToBottom(autoScrollToBottom)
    }
  }, [autoScrollToBottom, isLoading, store])
}
