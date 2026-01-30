/**
 * Tests for assistant system prompt building (uiMode differentiation).
 *
 * Verifies that the full UI prompt includes canvas/editor/chart instructions
 * while the compact (sticky widget) prompt uses inline markdown only.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { buildSystemPrompt, buildCompactPrompt, buildBaselinePrompt } from './assistant-service'

describe('Assistant Prompt Building', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('buildBaselinePrompt', () => {
    test('returns a non-empty string', () => {
      const prompt = buildBaselinePrompt()
      expect(prompt.length).toBeGreaterThan(0)
    })

    test('full mode includes more content than condensed', () => {
      const full = buildBaselinePrompt(false)
      const condensed = buildBaselinePrompt(true)
      // Full knowledge should be larger than condensed
      expect(full.length).toBeGreaterThan(condensed.length)
    })
  })

  describe('buildSystemPrompt (full UI)', () => {
    test('includes canvas instructions', () => {
      const prompt = buildSystemPrompt()
      expect(prompt).toContain('<canvas>')
      expect(prompt).toContain('Canvas Tool')
    })

    test('includes chart instructions', () => {
      const prompt = buildSystemPrompt()
      expect(prompt).toContain('Recharts')
      expect(prompt).toContain('BarChart')
      expect(prompt).toContain('ResponsiveContainer')
    })

    test('includes editor instructions', () => {
      const prompt = buildSystemPrompt()
      expect(prompt).toContain('<editor>')
      expect(prompt).toContain('Editor Integration')
    })

    test('includes UI Features section', () => {
      const prompt = buildSystemPrompt()
      expect(prompt).toContain('## UI Features')
    })

    test('includes baseline knowledge', () => {
      const prompt = buildSystemPrompt()
      // Baseline includes instance context — Fulcrum branding
      expect(prompt).toContain('Fulcrum')
    })
  })

  describe('buildCompactPrompt (sticky widget)', () => {
    test('does NOT include canvas instructions', () => {
      const prompt = buildCompactPrompt()
      expect(prompt).not.toContain('<canvas>')
      expect(prompt).not.toContain('Canvas Tool')
    })

    test('does NOT include chart instructions', () => {
      const prompt = buildCompactPrompt()
      expect(prompt).not.toContain('Recharts')
      expect(prompt).not.toContain('BarChart')
    })

    test('does NOT include editor instructions', () => {
      const prompt = buildCompactPrompt()
      expect(prompt).not.toContain('<editor>')
      expect(prompt).not.toContain('Editor Integration')
    })

    test('includes compact response format instructions', () => {
      const prompt = buildCompactPrompt()
      expect(prompt).toContain('compact chat widget')
      expect(prompt).toContain('inline as markdown')
      expect(prompt).toContain('concise')
    })

    test('includes baseline knowledge', () => {
      const prompt = buildCompactPrompt()
      expect(prompt).toContain('Fulcrum')
    })
  })

  describe('full vs compact differentiation', () => {
    test('full prompt is longer than compact (has more instructions)', () => {
      const full = buildSystemPrompt()
      const compact = buildCompactPrompt()
      expect(full.length).toBeGreaterThan(compact.length)
    })

    test('both include baseline content', () => {
      const full = buildSystemPrompt()
      const compact = buildCompactPrompt()
      // Both should reference Fulcrum
      expect(full).toContain('Fulcrum')
      expect(compact).toContain('Fulcrum')
    })

    test('only full prompt has UI Features section', () => {
      const full = buildSystemPrompt()
      const compact = buildCompactPrompt()
      expect(full).toContain('## UI Features')
      expect(compact).not.toContain('## UI Features')
    })

    test('only compact prompt has Response Format section', () => {
      const full = buildSystemPrompt()
      const compact = buildCompactPrompt()
      expect(compact).toContain('## Response Format')
      expect(full).not.toContain('## Response Format')
    })
  })
})
