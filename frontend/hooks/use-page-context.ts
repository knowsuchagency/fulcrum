import { useMemo } from 'react'
import { useRouterState } from '@tanstack/react-router'
import type { PageContext, PageType } from '../../shared/types'

/**
 * Determine page type from pathname
 */
function getPageType(pathname: string): PageType {
  // Remove trailing slash
  const path = pathname.replace(/\/$/, '') || '/'

  if (path === '/' || path === '/tasks') return 'tasks'
  if (path.startsWith('/tasks/') && path.split('/').length === 3) return 'task'
  if (path === '/projects') return 'projects'
  if (path.startsWith('/projects/') && path.split('/').length === 3) return 'project'
  if (path === '/repositories') return 'repositories'
  if (path.startsWith('/repositories/') && path.split('/').length === 3) return 'repository'
  if (path === '/monitoring') return 'monitoring'
  if (path === '/terminals') return 'terminals'
  if (path === '/apps') return 'apps'
  if (path.startsWith('/apps/') && path.split('/').length === 3) {
    const segment = path.split('/')[2]
    if (segment !== 'new') return 'app'
  }
  if (path === '/jobs') return 'jobs'
  if (path.startsWith('/jobs/') && path.split('/').length === 3) {
    const segment = path.split('/')[2]
    if (segment !== 'new') return 'job'
  }
  if (path === '/settings') return 'settings'

  return 'unknown'
}

/**
 * Extract resource ID from pathname segment
 */
function extractId(pathname: string, prefix: string): string | undefined {
  const path = pathname.replace(/\/$/, '')
  if (!path.startsWith(prefix)) return undefined

  const segment = path.slice(prefix.length).split('/')[0]
  // Skip special values like 'new'
  if (!segment || segment === 'new') return undefined
  return segment
}

/**
 * Hook to extract page context from the current route
 *
 * This provides rich context about what page the user is viewing,
 * including resource IDs and search params.
 */
export function usePageContext(): PageContext {
  const location = useRouterState({ select: (s) => s.location })

  return useMemo(() => {
    const { pathname, search } = location
    const pageType = getPageType(pathname)

    const context: PageContext = {
      pageType,
      path: pathname,
    }

    // Extract resource IDs based on page type
    switch (pageType) {
      case 'task':
        context.taskId = extractId(pathname, '/tasks/')
        break
      case 'project':
        context.projectId = extractId(pathname, '/projects/')
        break
      case 'repository':
        context.repositoryId = extractId(pathname, '/repositories/')
        break
      case 'app':
        context.appId = extractId(pathname, '/apps/')
        break
      case 'job':
        context.jobId = extractId(pathname, '/jobs/')
        break
    }

    // Extract search params as filters
    const searchParams = search as Record<string, unknown>

    // Tasks page filters
    if (pageType === 'tasks') {
      const filters: PageContext['filters'] = {}
      if (typeof searchParams.project === 'string') {
        filters.project = searchParams.project
      }
      if (typeof searchParams.tags === 'string') {
        filters.tags = searchParams.tags.split(',').filter(Boolean)
      }
      if (typeof searchParams.view === 'string') {
        filters.view = searchParams.view
      }
      if (Object.keys(filters).length > 0) {
        context.filters = filters
      }
    }

    // Monitoring page active tab
    if (pageType === 'monitoring' && typeof searchParams.tab === 'string') {
      context.activeTab = searchParams.tab
    }

    return context
  }, [location])
}
