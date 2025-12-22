import { Hono } from 'hono'
import { db } from '../db'
import { repositories } from '../db/schema'
import {
  getAuthenticatedUser,
  fetchUserIssues,
  fetchUserPRs,
  fetchUserOrgs,
  parseGitHubRemoteUrl,
  type PRFilter,
  type IssueFilter,
} from '../services/github'

const app = new Hono()

// GET /api/github/user - Get authenticated user info
app.get('/user', async (c) => {
  const user = await getAuthenticatedUser()
  if (!user) {
    return c.json({ error: 'GitHub PAT not configured or invalid' }, 401)
  }
  return c.json(user)
})

// GET /api/github/orgs - Get user's organizations
app.get('/orgs', async (c) => {
  const orgs = await fetchUserOrgs()
  return c.json(orgs)
})

// GET /api/github/issues - Fetch user's open issues
// Query params: ?filter=assigned|created|mentioned&org=orgname&viboraReposOnly=true
app.get('/issues', async (c) => {
  const filter = (c.req.query('filter') || 'assigned') as IssueFilter
  const org = c.req.query('org') || undefined
  const viboraReposOnly = c.req.query('viboraReposOnly') === 'true'

  let repoFilters: { owner: string; repo: string }[] | undefined

  // Org filter takes precedence over viboraReposOnly
  if (!org && viboraReposOnly) {
    const repos = db.select().from(repositories).all()
    repoFilters = repos
      .filter((r) => r.remoteUrl)
      .map((r) => parseGitHubRemoteUrl(r.remoteUrl!))
      .filter((r): r is { owner: string; repo: string } => r !== null)

    // If no Vibora repos have GitHub remotes, return empty
    if (repoFilters.length === 0) {
      return c.json([])
    }
  }

  const issues = await fetchUserIssues(filter, repoFilters, org)
  return c.json(issues)
})

// GET /api/github/prs - Fetch user's PRs
// Query params: ?filter=all|created|assigned|review_requested|mentioned&org=orgname&viboraReposOnly=true
app.get('/prs', async (c) => {
  const filter = (c.req.query('filter') || 'all') as PRFilter
  const org = c.req.query('org') || undefined
  const viboraReposOnly = c.req.query('viboraReposOnly') === 'true'

  let repoFilters: { owner: string; repo: string }[] | undefined

  // Org filter takes precedence over viboraReposOnly
  if (!org && viboraReposOnly) {
    const repos = db.select().from(repositories).all()
    repoFilters = repos
      .filter((r) => r.remoteUrl)
      .map((r) => parseGitHubRemoteUrl(r.remoteUrl!))
      .filter((r): r is { owner: string; repo: string } => r !== null)

    // If no Vibora repos have GitHub remotes, return empty
    if (repoFilters.length === 0) {
      return c.json([])
    }
  }

  const prs = await fetchUserPRs(filter, repoFilters, org)
  return c.json(prs)
})

export default app
