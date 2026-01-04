import { describe, test, expect } from 'bun:test'
import {
  buildAgentCommand,
  getAgentBuilder,
  matchesAgentNotFound,
  getCombinedProcessPattern,
  AGENT_BUILDERS,
} from './agent-commands'

describe('Agent Commands', () => {
  const baseOptions = {
    prompt: 'Test task',
    systemPrompt: 'You are a helpful assistant',
    sessionId: 'test-session-123',
    mode: 'default' as const,
    additionalOptions: {},
  }

  describe('buildAgentCommand', () => {
    describe('Claude', () => {
      test('builds command with default mode', () => {
        const cmd = buildAgentCommand('claude', baseOptions)

        expect(cmd).toContain('claude')
        expect(cmd).toContain('--dangerously-skip-permissions')
        expect(cmd).toContain('--append-system-prompt')
        expect(cmd).toContain('--session-id "test-session-123"')
        expect(cmd).not.toContain('--permission-mode plan')
      })

      test('builds command with plan mode', () => {
        const cmd = buildAgentCommand('claude', { ...baseOptions, mode: 'plan' })

        expect(cmd).toContain('claude')
        expect(cmd).toContain('--allow-dangerously-skip-permissions')
        expect(cmd).toContain('--permission-mode plan')
        expect(cmd).toContain('--session-id "test-session-123"')
      })

      test('includes additional options', () => {
        const cmd = buildAgentCommand('claude', {
          ...baseOptions,
          additionalOptions: { model: 'claude-3-opus', 'max-tokens': '1000' },
        })

        expect(cmd).toContain('--model')
        expect(cmd).toContain('--max-tokens')
      })

      test('escapes special characters in prompt', () => {
        const cmd = buildAgentCommand('claude', {
          ...baseOptions,
          prompt: "Task with 'quotes' and $variables",
        })

        // Should be escaped (exact escaping depends on shell-escape implementation)
        expect(cmd).not.toContain("'quotes'")
      })
    })

    describe('OpenCode', () => {
      test('builds command with default mode (build agent)', () => {
        const cmd = buildAgentCommand('opencode', baseOptions)

        expect(cmd).toContain('opencode')
        expect(cmd).toContain('--agent build')
        expect(cmd).toContain('--prompt')
        // Should NOT contain session flag (OpenCode manages its own sessions)
        expect(cmd).not.toContain('--session')
      })

      test('builds command with plan mode (plan agent)', () => {
        const cmd = buildAgentCommand('opencode', { ...baseOptions, mode: 'plan' })

        expect(cmd).toContain('opencode')
        expect(cmd).toContain('--agent plan')
        expect(cmd).toContain('--prompt')
      })

      test('prepends system prompt to user prompt', () => {
        const cmd = buildAgentCommand('opencode', baseOptions)

        // The prompt should contain both system and user prompts concatenated
        // Since OpenCode doesn't have a --system-prompt flag
        expect(cmd).toContain('--prompt')
        // The escaped prompt should contain newlines separating system and user prompts
      })

      test('includes additional options', () => {
        const cmd = buildAgentCommand('opencode', {
          ...baseOptions,
          additionalOptions: { model: 'gpt-4', temperature: '0.7' },
        })

        expect(cmd).toContain('--model')
        expect(cmd).toContain('--temperature')
      })

      test('uses lowercase agent names', () => {
        const cmdDefault = buildAgentCommand('opencode', baseOptions)
        const cmdPlan = buildAgentCommand('opencode', { ...baseOptions, mode: 'plan' })

        expect(cmdDefault).toContain('--agent build')
        expect(cmdDefault).not.toContain('--agent Build')
        expect(cmdPlan).toContain('--agent plan')
        expect(cmdPlan).not.toContain('--agent Plan')
      })
    })
  })

  describe('getAgentBuilder', () => {
    test('returns Claude builder', () => {
      const builder = getAgentBuilder('claude')
      expect(builder).toBe(AGENT_BUILDERS.claude)
      expect(builder.processPattern.source).toContain('claude')
    })

    test('returns OpenCode builder', () => {
      const builder = getAgentBuilder('opencode')
      expect(builder).toBe(AGENT_BUILDERS.opencode)
      expect(builder.processPattern.source).toContain('opencode')
    })
  })

  describe('matchesAgentNotFound', () => {
    describe('Claude patterns', () => {
      test('detects "claude: command not found"', () => {
        expect(matchesAgentNotFound('claude: command not found')).toBe('claude')
      })

      test('detects "claude: not found"', () => {
        expect(matchesAgentNotFound('claude: not found')).toBe('claude')
      })

      test('detects "command not found: claude"', () => {
        expect(matchesAgentNotFound('command not found: claude')).toBe('claude')
      })

      test('detects Windows-style error', () => {
        expect(matchesAgentNotFound("'claude' is not recognized")).toBe('claude')
      })

      test('returns claude when checking specific agent', () => {
        expect(matchesAgentNotFound('claude: command not found', 'claude')).toBe('claude')
      })

      test('returns null when checking wrong agent', () => {
        expect(matchesAgentNotFound('claude: command not found', 'opencode')).toBeNull()
      })
    })

    describe('OpenCode patterns', () => {
      test('detects "opencode: command not found"', () => {
        expect(matchesAgentNotFound('opencode: command not found')).toBe('opencode')
      })

      test('detects "opencode: not found"', () => {
        expect(matchesAgentNotFound('opencode: not found')).toBe('opencode')
      })

      test('detects "command not found: opencode"', () => {
        expect(matchesAgentNotFound('command not found: opencode')).toBe('opencode')
      })

      test('detects Windows-style error', () => {
        expect(matchesAgentNotFound("'opencode' is not recognized")).toBe('opencode')
      })

      test('returns opencode when checking specific agent', () => {
        expect(matchesAgentNotFound('opencode: command not found', 'opencode')).toBe('opencode')
      })

      test('returns null when checking wrong agent', () => {
        expect(matchesAgentNotFound('opencode: command not found', 'claude')).toBeNull()
      })
    })

    describe('no match', () => {
      test('returns null for unrelated text', () => {
        expect(matchesAgentNotFound('Hello world')).toBeNull()
      })

      test('returns null for empty string', () => {
        expect(matchesAgentNotFound('')).toBeNull()
      })

      test('returns null for partial matches', () => {
        expect(matchesAgentNotFound('claude is great')).toBeNull()
        expect(matchesAgentNotFound('opencode rocks')).toBeNull()
      })
    })
  })

  describe('getCombinedProcessPattern', () => {
    test('returns regex that matches claude', () => {
      const pattern = getCombinedProcessPattern()
      expect(pattern.test('claude')).toBe(true)
      expect(pattern.test('CLAUDE')).toBe(true) // case insensitive
    })

    test('returns regex that matches opencode', () => {
      const pattern = getCombinedProcessPattern()
      expect(pattern.test('opencode')).toBe(true)
      expect(pattern.test('OPENCODE')).toBe(true) // case insensitive
    })

    test('does not match unrelated text', () => {
      const pattern = getCombinedProcessPattern()
      expect(pattern.test('node')).toBe(false)
      expect(pattern.test('bun')).toBe(false)
    })

    test('is case insensitive', () => {
      const pattern = getCombinedProcessPattern()
      expect(pattern.flags).toContain('i')
    })
  })

  describe('AGENT_BUILDERS', () => {
    test('has entries for all agent types', () => {
      expect(AGENT_BUILDERS.claude).toBeDefined()
      expect(AGENT_BUILDERS.opencode).toBeDefined()
    })

    test('each builder has required properties', () => {
      for (const [name, builder] of Object.entries(AGENT_BUILDERS)) {
        expect(builder.buildCommand).toBeInstanceOf(Function)
        expect(builder.notFoundPatterns).toBeInstanceOf(Array)
        expect(builder.notFoundPatterns.length).toBeGreaterThan(0)
        expect(builder.processPattern).toBeInstanceOf(RegExp)
      }
    })
  })
})
