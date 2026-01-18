import { describe, test, expect } from 'bun:test'
import { fuzzyScore } from './fuzzy-search'

describe('fuzzyScore', () => {
  describe('exact match', () => {
    test('returns 100 for exact match', () => {
      expect(fuzzyScore('hello', 'hello')).toBe(100)
    })

    test('is case insensitive', () => {
      expect(fuzzyScore('Hello', 'hello')).toBe(100)
      expect(fuzzyScore('HELLO', 'hello')).toBe(100)
      expect(fuzzyScore('hello', 'HELLO')).toBe(100)
    })
  })

  describe('starts with', () => {
    test('returns 80 for starts with match', () => {
      expect(fuzzyScore('hello world', 'hello')).toBe(80)
    })

    test('is case insensitive', () => {
      expect(fuzzyScore('Hello World', 'hello')).toBe(80)
    })
  })

  describe('contains', () => {
    test('returns 60 for contains match', () => {
      expect(fuzzyScore('say hello there', 'hello')).toBe(60)
    })

    test('is case insensitive', () => {
      expect(fuzzyScore('Say Hello There', 'hello')).toBe(60)
    })

    test('matches substring anywhere in text', () => {
      expect(fuzzyScore('before hello after', 'hello')).toBe(60)
      expect(fuzzyScore('xxxhelloxxx', 'hello')).toBe(60)
    })
  })

  describe('no match', () => {
    test('returns 0 for no match', () => {
      expect(fuzzyScore('hello', 'world')).toBe(0)
    })

    test('empty query starts with everything', () => {
      expect(fuzzyScore('hello', '')).toBe(80) // Starts with empty string
    })

    test('returns 0 for partial characters not forming substring', () => {
      expect(fuzzyScore('abc', 'cba')).toBe(0)
      expect(fuzzyScore('hxexlxlxo', 'hello')).toBe(0)
    })

    test('returns 0 when query longer than text', () => {
      expect(fuzzyScore('hello', 'helloz')).toBe(0)
      expect(fuzzyScore('abc', 'abcd')).toBe(0)
    })
  })

  describe('score ordering', () => {
    test('exact match > starts with > contains', () => {
      const exact = fuzzyScore('hello', 'hello')
      const startsWith = fuzzyScore('hello world', 'hello')
      const contains = fuzzyScore('say hello', 'hello')

      expect(exact).toBeGreaterThan(startsWith)
      expect(startsWith).toBeGreaterThan(contains)
    })
  })

  describe('real-world examples', () => {
    test('task search matching', () => {
      // Matches substring
      expect(fuzzyScore('src/components/Button.tsx', 'button')).toBe(60)
      expect(fuzzyScore('Button.tsx', 'Button')).toBe(80)
      expect(fuzzyScore('git status', 'git')).toBe(80)

      // Does NOT match scattered characters
      expect(fuzzyScore('src/components/Button.tsx', 'btn')).toBe(0)
      expect(fuzzyScore('git status', 'gs')).toBe(0)
      expect(fuzzyScore('occasionally', 'ocai')).toBe(0)
    })

    test('label matching is case insensitive', () => {
      expect(fuzzyScore('OCAI', 'ocai')).toBe(100)
      expect(fuzzyScore('ocai', 'OCAI')).toBe(100)
      expect(fuzzyScore('test OCAI label', 'ocai')).toBe(60)
    })
  })
})
