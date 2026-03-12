/**
 * Agent Coordination Board - Type Definitions
 *
 * Filesystem-based message board for coordinating multiple AI agents
 * running in separate Fulcrum worktrees on the same project.
 */

export type MessageType = 'claim' | 'release' | 'info' | 'warning' | 'request'

export type AgentType = 'claude' | 'opencode' | 'unknown'

export interface BoardMessage {
  id: string
  timestamp: string
  type: MessageType
  agent: AgentType
  taskId?: string
  taskTitle?: string
  project?: string
  repository?: string
  worktree?: string
  ttl: number
  body: string
  refs?: string[]
  tags?: string[]
}

export interface PostMessageInput {
  body: string
  type?: MessageType
  tags?: string[]
  ttl?: number
  refContent?: string
}

export interface ReadOptions {
  since?: string
  type?: MessageType
  project?: string
  tag?: string
  limit?: number
}

/** Default TTLs in seconds per message type */
export const DEFAULT_TTLS: Record<MessageType, number> = {
  claim: 7200,     // 2 hours
  release: 300,    // 5 minutes
  info: 3600,      // 1 hour
  warning: 7200,   // 2 hours
  request: 14400,  // 4 hours
}
