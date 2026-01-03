/**
 * Agent command builder abstraction
 *
 * Builds CLI commands for different AI coding agents (Claude Code, OpenCode).
 * Each agent has its own CLI interface with different flags and options.
 */

import type { AgentType } from '@/types'
import { escapeForShell } from './shell-escape'

export interface AgentCommandOptions {
  /** The task prompt/description */
  prompt: string
  /** System prompt to inject (Vibora context) */
  systemPrompt: string
  /** Session ID for terminal correlation */
  sessionId: string
  /** AI mode: default (full autonomy) or plan (restricted) */
  mode: 'default' | 'plan'
  /** Additional CLI options from agentOptions */
  additionalOptions: Record<string, string>
}

export interface AgentCommandBuilder {
  /** Build the CLI command to start this agent */
  buildCommand(options: AgentCommandOptions): string
  /** Patterns to detect "command not found" in terminal output */
  notFoundPatterns: RegExp[]
  /** Process name pattern for monitoring */
  processPattern: RegExp
}

/**
 * Claude Code command builder
 * https://docs.anthropic.com/en/docs/claude-code/cli
 */
const claudeBuilder: AgentCommandBuilder = {
  buildCommand({ prompt, systemPrompt, sessionId, mode, additionalOptions }) {
    const escapedPrompt = escapeForShell(prompt)
    const escapedSystemPrompt = escapeForShell(systemPrompt)

    // Build additional CLI options
    let extraFlags = ''
    if (additionalOptions && Object.keys(additionalOptions).length > 0) {
      extraFlags = Object.entries(additionalOptions)
        .map(([key, value]) => ` --${key} ${escapeForShell(value)}`)
        .join('')
    }

    if (mode === 'plan') {
      return `claude ${escapedPrompt} --append-system-prompt ${escapedSystemPrompt} --session-id "${sessionId}" --allow-dangerously-skip-permissions --permission-mode plan${extraFlags}`
    }
    return `claude ${escapedPrompt} --append-system-prompt ${escapedSystemPrompt} --session-id "${sessionId}" --dangerously-skip-permissions${extraFlags}`
  },
  notFoundPatterns: [
    /claude: command not found/,
    /claude: not found/,
    /'claude' is not recognized/,
    /command not found: claude/,
  ],
  processPattern: /\bclaude\b/i,
}

/**
 * OpenCode command builder
 * https://opencode.ai/docs/cli/
 *
 * OpenCode uses a different CLI structure:
 * - `opencode run <prompt>` for non-interactive mode
 * - `--agent Build` (default) or `--agent Plan` for mode selection
 * - `--session` for session management
 * - System prompts via custom agent config (we use --agent with inline config)
 */
const opencodeBuilder: AgentCommandBuilder = {
  buildCommand({ prompt, systemPrompt, sessionId, mode, additionalOptions }) {
    // OpenCode uses --agent flag to select Build (full) or Plan (restricted) mode
    const agentMode = mode === 'plan' ? 'Plan' : 'Build'

    // Build additional CLI options
    let extraFlags = ''
    if (additionalOptions && Object.keys(additionalOptions).length > 0) {
      extraFlags = Object.entries(additionalOptions)
        .map(([key, value]) => ` --${key} ${escapeForShell(value)}`)
        .join('')
    }

    // OpenCode doesn't have a direct --system-prompt flag like Claude.
    // For now, we prepend the system prompt to the user prompt.
    // A more sophisticated approach would create a temporary custom agent config.
    const fullPrompt = `${systemPrompt}\n\n${prompt}`
    const escapedFullPrompt = escapeForShell(fullPrompt)

    // Use session flag for continuity
    return `opencode run ${escapedFullPrompt} --agent ${agentMode} --session "${sessionId}"${extraFlags}`
  },
  notFoundPatterns: [
    /opencode: command not found/,
    /opencode: not found/,
    /'opencode' is not recognized/,
    /command not found: opencode/,
  ],
  processPattern: /\bopencode\b/i,
}

/**
 * Map of agent types to their command builders
 */
export const AGENT_BUILDERS: Record<AgentType, AgentCommandBuilder> = {
  claude: claudeBuilder,
  opencode: opencodeBuilder,
}

/**
 * Get the command builder for a specific agent type
 */
export function getAgentBuilder(agent: AgentType): AgentCommandBuilder {
  return AGENT_BUILDERS[agent]
}

/**
 * Build a command to start an agent
 */
export function buildAgentCommand(agent: AgentType, options: AgentCommandOptions): string {
  return AGENT_BUILDERS[agent].buildCommand(options)
}

/**
 * Check if terminal output matches "command not found" for any known agent
 */
export function matchesAgentNotFound(text: string, agent?: AgentType): AgentType | null {
  if (agent) {
    // Check specific agent
    const builder = AGENT_BUILDERS[agent]
    if (builder.notFoundPatterns.some((pattern) => pattern.test(text))) {
      return agent
    }
    return null
  }

  // Check all agents
  for (const [agentType, builder] of Object.entries(AGENT_BUILDERS)) {
    if (builder.notFoundPatterns.some((pattern) => pattern.test(text))) {
      return agentType as AgentType
    }
  }
  return null
}

/**
 * Get combined process pattern for detecting any agent
 */
export function getCombinedProcessPattern(): RegExp {
  const patterns = Object.values(AGENT_BUILDERS).map((b) => b.processPattern.source)
  return new RegExp(patterns.join('|'), 'i')
}
