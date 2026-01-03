/**
 * Agent command builder abstraction
 *
 * Builds CLI commands for different AI coding agents (Claude, OpenCode, Codex, Gemini).
 * Each agent has its own CLI interface with different flags and options.
 */

import type { AgentType } from '@shared/types'
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
 * OpenAI Codex command builder
 * https://platform.openai.com/docs/codex
 *
 * Note: Codex CLI interface may vary. This is a placeholder implementation.
 */
const codexBuilder: AgentCommandBuilder = {
  buildCommand({ prompt, systemPrompt, mode, additionalOptions }) {
    // Combine system prompt with user prompt
    const fullPrompt = `${systemPrompt}\n\n${prompt}`
    const escapedPrompt = escapeForShell(fullPrompt)

    let extraFlags = ''
    if (additionalOptions && Object.keys(additionalOptions).length > 0) {
      extraFlags = Object.entries(additionalOptions)
        .map(([key, value]) => ` --${key} ${escapeForShell(value)}`)
        .join('')
    }

    // Codex uses --full-auto for autonomous mode
    const autoFlag = mode === 'plan' ? '' : ' --full-auto'

    return `codex ${escapedPrompt}${autoFlag}${extraFlags}`
  },
  notFoundPatterns: [
    /codex: command not found/,
    /codex: not found/,
    /'codex' is not recognized/,
    /command not found: codex/,
  ],
  processPattern: /\bcodex\b/i,
}

/**
 * Gemini CLI command builder
 * https://ai.google.dev/gemini-api/docs
 *
 * Note: Gemini CLI interface may vary. This is a placeholder implementation.
 */
const geminiBuilder: AgentCommandBuilder = {
  buildCommand({ prompt, systemPrompt, additionalOptions }) {
    let extraFlags = ''
    if (additionalOptions && Object.keys(additionalOptions).length > 0) {
      extraFlags = Object.entries(additionalOptions)
        .map(([key, value]) => ` --${key} ${escapeForShell(value)}`)
        .join('')
    }

    // Gemini CLI structure - combine system prompt with user prompt
    const fullPrompt = `${systemPrompt}\n\n${prompt}`
    const escapedPrompt = escapeForShell(fullPrompt)

    return `gemini ${escapedPrompt}${extraFlags}`
  },
  notFoundPatterns: [
    /gemini: command not found/,
    /gemini: not found/,
    /'gemini' is not recognized/,
    /command not found: gemini/,
    /gemini-cli: command not found/,
  ],
  processPattern: /\bgemini(-cli)?\b/i,
}

/**
 * Map of agent types to their command builders
 */
export const AGENT_BUILDERS: Record<AgentType, AgentCommandBuilder> = {
  claude: claudeBuilder,
  opencode: opencodeBuilder,
  codex: codexBuilder,
  gemini: geminiBuilder,
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
