import { Octokit } from '@octokit/rest'
import { getSetting } from '../lib/settings'

export interface GitHubIssue {
  id: number
  number: number
  title: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  repository: { owner: string; repo: string; fullName: string }
  labels: { name: string; color: string }[]
}

export interface GitHubPR {
  id: number
  number: number
  title: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  draft: boolean
  repository: { owner: string; repo: string; fullName: string }
  author: { login: string; avatarUrl: string }
  labels: { name: string; color: string }[]
}

export interface GitHubUser {
  login: string
  avatarUrl: string
}

let octokitClient: Octokit | null = null
let cachedPat: string | null = null

function getOctokit(): Octokit | null {
  const pat = getSetting('githubPat')
  if (!pat) return null

  // Recreate client if PAT changed
  if (pat !== cachedPat) {
    octokitClient = new Octokit({ auth: pat })
    cachedPat = pat
  }

  return octokitClient
}

// Parse GitHub remote URL to extract owner/repo
// Handles: https://github.com/owner/repo.git, git@github.com:owner/repo.git
export function parseGitHubRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  return null
}

export async function getAuthenticatedUser(): Promise<GitHubUser | null> {
  const octokit = getOctokit()
  if (!octokit) return null

  try {
    const { data } = await octokit.users.getAuthenticated()
    return {
      login: data.login,
      avatarUrl: data.avatar_url,
    }
  } catch {
    return null
  }
}

export async function fetchUserIssues(
  repoFilters?: { owner: string; repo: string }[]
): Promise<GitHubIssue[]> {
  const octokit = getOctokit()
  if (!octokit) return []

  try {
    // Build search query
    let query = 'is:issue is:open author:@me'

    if (repoFilters && repoFilters.length > 0) {
      const repoQueries = repoFilters.map((r) => `repo:${r.owner}/${r.repo}`).join(' ')
      query = `${query} ${repoQueries}`
    }

    const { data } = await octokit.search.issuesAndPullRequests({
      q: query,
      sort: 'updated',
      order: 'desc',
      per_page: 100,
    })

    return data.items
      .filter((item) => !('pull_request' in item && item.pull_request))
      .map((issue) => {
        // Extract owner/repo from repository_url
        const repoMatch = issue.repository_url.match(/repos\/([^/]+)\/([^/]+)$/)
        const owner = repoMatch?.[1] ?? ''
        const repo = repoMatch?.[2] ?? ''

        return {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          repository: {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
          },
          labels: (issue.labels ?? [])
            .filter((l): l is { name: string; color: string } => typeof l === 'object' && l !== null && 'name' in l)
            .map((l) => ({
              name: l.name ?? '',
              color: l.color ?? '',
            })),
        }
      })
  } catch (err) {
    console.error('Failed to fetch GitHub issues:', err)
    return []
  }
}

export async function fetchUserPRs(
  filter: 'all' | 'created' | 'assigned',
  repoFilters?: { owner: string; repo: string }[]
): Promise<GitHubPR[]> {
  const octokit = getOctokit()
  if (!octokit) return []

  try {
    const results: GitHubPR[] = []

    // Build repo filter string
    const repoQueryPart =
      repoFilters && repoFilters.length > 0
        ? repoFilters.map((r) => `repo:${r.owner}/${r.repo}`).join(' ')
        : ''

    // Fetch based on filter
    if (filter === 'all' || filter === 'created') {
      const query = `is:pr is:open author:@me ${repoQueryPart}`.trim()
      const { data } = await octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: 100,
      })

      for (const pr of data.items) {
        const repoMatch = pr.repository_url.match(/repos\/([^/]+)\/([^/]+)$/)
        const owner = repoMatch?.[1] ?? ''
        const repo = repoMatch?.[2] ?? ''

        results.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          htmlUrl: pr.html_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          draft: pr.draft ?? false,
          repository: {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
          },
          author: {
            login: pr.user?.login ?? '',
            avatarUrl: pr.user?.avatar_url ?? '',
          },
          labels: (pr.labels ?? [])
            .filter((l): l is { name: string; color: string } => typeof l === 'object' && l !== null && 'name' in l)
            .map((l) => ({
              name: l.name ?? '',
              color: l.color ?? '',
            })),
        })
      }
    }

    if (filter === 'all' || filter === 'assigned') {
      const query = `is:pr is:open assignee:@me ${repoQueryPart}`.trim()
      const { data } = await octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: 100,
      })

      for (const pr of data.items) {
        // Skip if already in results (for 'all' filter)
        if (results.some((r) => r.id === pr.id)) continue

        const repoMatch = pr.repository_url.match(/repos\/([^/]+)\/([^/]+)$/)
        const owner = repoMatch?.[1] ?? ''
        const repo = repoMatch?.[2] ?? ''

        results.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          htmlUrl: pr.html_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          draft: pr.draft ?? false,
          repository: {
            owner,
            repo,
            fullName: `${owner}/${repo}`,
          },
          author: {
            login: pr.user?.login ?? '',
            avatarUrl: pr.user?.avatar_url ?? '',
          },
          labels: (pr.labels ?? [])
            .filter((l): l is { name: string; color: string } => typeof l === 'object' && l !== null && 'name' in l)
            .map((l) => ({
              name: l.name ?? '',
              color: l.color ?? '',
            })),
        })
      }
    }

    // Sort by updated date
    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    return results
  } catch (err) {
    console.error('Failed to fetch GitHub PRs:', err)
    return []
  }
}
