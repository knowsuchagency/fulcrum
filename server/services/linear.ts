import { LinearClient } from '@linear/sdk'
import { getSetting } from '../lib/settings'

export interface LinearTicketInfo {
  id: string
  identifier: string // e.g., "TEAM-123"
  title: string
  status: string
  url: string
}

let linearClient: LinearClient | null = null

function getLinearClient(): LinearClient | null {
  const apiKey = getSetting('linearApiKey')
  if (!apiKey) return null
  if (!linearClient) {
    linearClient = new LinearClient({ apiKey })
  }
  return linearClient
}

export function parseLinearUrl(url: string): string | null {
  // https://linear.app/team/issue/TEAM-123/title-slug
  const match = url.match(/\/issue\/([A-Z]+-\d+)/i)
  return match?.[1] ?? null
}

export async function fetchLinearTicket(identifier: string): Promise<LinearTicketInfo | null> {
  const client = getLinearClient()
  if (!client) return null

  try {
    const issue = await client.issue(identifier)
    if (!issue) return null

    const state = await issue.state
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: state?.name ?? 'Unknown',
      url: issue.url,
    }
  } catch {
    return null
  }
}

// Map Vibora task status to Linear state names (case-insensitive matching)
const STATUS_MAP: Record<string, string[]> = {
  IN_PROGRESS: ['In Progress', 'Started', 'In Development'],
  IN_REVIEW: ['In Review', 'Review', 'Ready for Review'],
  DONE: ['Done', 'Completed', 'Closed'],
  CANCELLED: ['Canceled', 'Cancelled'],
}

export async function updateLinearTicketStatus(
  identifier: string,
  viboraStatus: string
): Promise<{ success: boolean; error?: string; newStatus?: string }> {
  const client = getLinearClient()
  if (!client) {
    return { success: false, error: 'Linear API key not configured' }
  }

  try {
    // Fetch the issue to get its team
    const issue = await client.issue(identifier)
    if (!issue) {
      return { success: false, error: 'Issue not found' }
    }

    // Get the team's workflow states
    const team = await issue.team
    if (!team) {
      return { success: false, error: 'Team not found for issue' }
    }

    const workflowStates = (await team.states()).nodes

    // Find a matching state by name
    const targetStateNames = STATUS_MAP[viboraStatus] ?? []
    const targetState = workflowStates.find((state) =>
      targetStateNames.some(
        (name) => state.name.toLowerCase() === name.toLowerCase()
      )
    )

    if (!targetState) {
      // No matching state found - not an error, just skip
      return {
        success: true,
        error: `No matching Linear state for "${viboraStatus}"`,
      }
    }

    // Update the issue with the new state
    await client.updateIssue(issue.id, { stateId: targetState.id })

    return { success: true, newStatus: targetState.name }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update Linear ticket',
    }
  }
}
