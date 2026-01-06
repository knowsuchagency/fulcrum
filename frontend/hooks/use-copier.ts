import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJSON } from '@/lib/api'
import { useRepositories } from './use-repositories'
import type {
  CopierQuestionsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
} from '@/types'

const API_BASE = ''

/**
 * Fetch copier questions from a template source
 * @param source - Repository ID, local path, or git URL
 */
export function useCopierQuestions(source: string | null) {
  return useQuery({
    queryKey: ['copier-questions', source],
    queryFn: () =>
      fetchJSON<CopierQuestionsResponse>(
        `${API_BASE}/api/copier/questions?source=${encodeURIComponent(source!)}`
      ),
    enabled: !!source,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on error (e.g., invalid template)
  })
}

/**
 * Get repositories marked as Copier templates
 */
export function useCopierTemplates() {
  const { data: repositories, ...rest } = useRepositories()

  return {
    ...rest,
    data: repositories?.filter((repo) => repo.isCopierTemplate) ?? [],
  }
}

/**
 * Create a new project from a Copier template
 */
export function useCreateProjectFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateProjectRequest) =>
      fetchJSON<CreateProjectResponse>(`${API_BASE}/api/copier/create`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
