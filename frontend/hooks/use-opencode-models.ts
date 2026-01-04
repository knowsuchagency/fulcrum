import { useQuery } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'

interface OpencodeModelsResponse {
  installed: boolean
  providers: Record<string, string[]>
  models: string[]
}

/**
 * Fetch available OpenCode models from the backend.
 * The backend runs `opencode models` CLI command and parses the output.
 */
export function useOpencodeModels() {
  const query = useQuery({
    queryKey: ['opencode', 'models'],
    queryFn: () => fetchJSON<OpencodeModelsResponse>('/api/opencode/models'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  })

  return {
    ...query,
    installed: query.data?.installed ?? false,
    providers: query.data?.providers ?? {},
    models: query.data?.models ?? [],
  }
}
