import { describe, test, expect } from 'bun:test'
import { escapeForShell } from './shell-escape'

describe('escapeForShell', () => {
  describe('basic strings', () => {
    test('wraps simple string in ANSI-C quotes', () => {
      expect(escapeForShell('hello')).toBe("$'hello'")
    })

    test('handles empty string', () => {
      expect(escapeForShell('')).toBe("$''")
    })

    test('handles string with spaces', () => {
      expect(escapeForShell('hello world')).toBe("$'hello world'")
    })
  })

  describe('quote escaping', () => {
    test('escapes single quotes', () => {
      expect(escapeForShell("it's")).toBe("$'it\\'s'")
    })

    test('escapes multiple single quotes', () => {
      expect(escapeForShell("'hello' 'world'")).toBe("$'\\'hello\\' \\'world\\''")
    })
  })

  describe('backslash escaping', () => {
    test('escapes backslashes', () => {
      expect(escapeForShell('path\\to\\file')).toBe("$'path\\\\to\\\\file'")
    })

    test('escapes backslash before quote', () => {
      expect(escapeForShell("\\'")).toBe("$'\\\\\\''")
    })
  })

  describe('whitespace escaping', () => {
    test('escapes newlines', () => {
      expect(escapeForShell('line1\nline2')).toBe("$'line1\\nline2'")
    })

    test('escapes carriage returns', () => {
      expect(escapeForShell('line1\rline2')).toBe("$'line1\\rline2'")
    })

    test('escapes tabs', () => {
      expect(escapeForShell('col1\tcol2')).toBe("$'col1\\tcol2'")
    })

    test('escapes mixed whitespace', () => {
      expect(escapeForShell('a\nb\rc\td')).toBe("$'a\\nb\\rc\\td'")
    })
  })

  describe('complex strings', () => {
    test('handles string with multiple special characters', () => {
      const input = "hello 'world'\ntest\\path"
      const result = escapeForShell(input)
      expect(result).toBe("$'hello \\'world\\'\\ntest\\\\path'")
    })

    test('handles shell metacharacters safely', () => {
      // Dollar signs, backticks, etc. are safe inside ANSI-C quotes
      expect(escapeForShell('$HOME')).toBe("$'$HOME'")
      expect(escapeForShell('`whoami`')).toBe("$'`whoami`'")
      expect(escapeForShell('$(pwd)')).toBe("$'$(pwd)'")
    })

    test('handles double quotes (no escape needed in ANSI-C)', () => {
      expect(escapeForShell('"quoted"')).toBe("$'\"quoted\"'")
    })
  })

  describe('real-world examples', () => {
    test('escapes git commit message with quotes', () => {
      const message = "fix: don't break on 'special' chars"
      const escaped = escapeForShell(message)
      expect(escaped).toContain("\\'")
    })

    test('escapes multi-line prompt', () => {
      const prompt = 'Line 1\nLine 2\nLine 3'
      const escaped = escapeForShell(prompt)
      expect(escaped).toBe("$'Line 1\\nLine 2\\nLine 3'")
    })

    test('escapes path with backslashes (Windows-style)', () => {
      const path = 'C:\\Users\\Name\\file.txt'
      const escaped = escapeForShell(path)
      expect(escaped).toBe("$'C:\\\\Users\\\\Name\\\\file.txt'")
    })
  })
})
