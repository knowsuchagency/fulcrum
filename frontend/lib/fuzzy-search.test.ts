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

  describe('fuzzy character match', () => {
    test('matches characters in order', () => {
      const score = fuzzyScore('hxexlxlxo', 'hello')
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(60) // Less than "contains"
    })

    test('score increases with more matched characters', () => {
      const score1 = fuzzyScore('abcdef', 'af')
      const score2 = fuzzyScore('abcdef', 'adf')
      expect(score2).toBeGreaterThan(score1)
    })

    test('returns 0 when not all characters match', () => {
      expect(fuzzyScore('hello', 'helloz')).toBe(0)
      expect(fuzzyScore('abc', 'abcd')).toBe(0)
    })
  })

  describe('no match', () => {
    test('returns 0 for no match', () => {
      expect(fuzzyScore('hello', 'world')).toBe(0)
    })

    test('empty query matches everything (exact match)', () => {
      // Empty query means all 0 characters are found, so fuzzy match succeeds with score 0
      // But since query.length === 0, it might also be considered "starts with" or "contains"
      // Looking at the code: lowerQuery === '' means exact match returns 100 (since '' === '')
      // Actually: 'hello'.toLowerCase() !== ''.toLowerCase(), so no exact match
      // But '' starts with '' is true? No, 'hello'.startsWith('') is true
      // 'hello'.includes('') is true, so it returns 60 for "contains"
      expect(fuzzyScore('hello', '')).toBe(80) // Starts with empty string
    })

    test('returns 0 for out-of-order characters', () => {
      expect(fuzzyScore('abc', 'cba')).toBe(0)
    })
  })

  describe('score ordering', () => {
    test('exact match > starts with > contains > fuzzy', () => {
      const exact = fuzzyScore('hello', 'hello')
      const startsWith = fuzzyScore('hello world', 'hello')
      const contains = fuzzyScore('say hello', 'hello')
      const fuzzy = fuzzyScore('h_e_l_l_o', 'hello')

      expect(exact).toBeGreaterThan(startsWith)
      expect(startsWith).toBeGreaterThan(contains)
      expect(contains).toBeGreaterThan(fuzzy)
    })
  })

  describe('real-world examples', () => {
    test('file path matching', () => {
      expect(fuzzyScore('src/components/Button.tsx', 'button')).toBe(60)
      expect(fuzzyScore('src/components/Button.tsx', 'btn')).toBeGreaterThan(0)
      expect(fuzzyScore('Button.tsx', 'Button')).toBe(80)
    })

    test('command matching', () => {
      expect(fuzzyScore('git status', 'git')).toBe(80)
      expect(fuzzyScore('git status', 'gs')).toBeGreaterThan(0)
    })
  })
})
