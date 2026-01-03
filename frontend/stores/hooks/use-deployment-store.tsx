import React, { createContext, useContext, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DeploymentStreamStore, type IDeploymentStreamStore } from '../deployment-store'
import { log } from '@/lib/logger'

/**
 * Context for the deployment stream store.
 * Provides access to deployment state across the app.
 */
const DeploymentStoreContext = createContext<IDeploymentStreamStore | null>(null)

/**
 * Hook to access the deployment stream store.
 * Must be used within a DeploymentStoreProvider.
 */
export function useDeploymentStore(): IDeploymentStreamStore {
  const store = useContext(DeploymentStoreContext)
  if (!store) {
    throw new Error('useDeploymentStore must be used within a DeploymentStoreProvider')
  }
  return store
}

/**
 * Provider component for the deployment stream store.
 * Creates and manages the store lifecycle.
 */
export function DeploymentStoreProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  // Create store with environment
  const store = useMemo(() => {
    return DeploymentStreamStore.create(
      {
        appId: null,
        isDeploying: false,
        logs: [],
        stage: null,
        error: null,
      },
      {
        log: log.deployment,
        invalidateQueries: (appId: string) => {
          queryClient.invalidateQueries({ queryKey: ['apps'] })
          queryClient.invalidateQueries({ queryKey: ['apps', appId] })
          queryClient.invalidateQueries({ queryKey: ['apps', appId, 'deployments'] })
        },
      }
    )
  }, [queryClient])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      store.disconnect()
    }
  }, [store])

  return (
    <DeploymentStoreContext.Provider value={store}>
      {children}
    </DeploymentStoreContext.Provider>
  )
}

export { DeploymentStoreContext }
