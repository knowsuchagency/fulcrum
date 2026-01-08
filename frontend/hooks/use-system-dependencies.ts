import { useQuery } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

interface DependencyStatus {
  installed: boolean
  path?: string
}

interface SystemDependencies {
  claudeCode: DependencyStatus
  openCode: DependencyStatus
  dtach: DependencyStatus
}

export function useSystemDependencies() {
  return useQuery({
    queryKey: ['system', 'dependencies'],
    queryFn: () => fetchJSON<SystemDependencies>('/api/system/dependencies'),
    staleTime: 30 * 1000, // Recheck every 30 seconds
    refetchOnWindowFocus: true, // Recheck when user comes back to the app
  })
}
