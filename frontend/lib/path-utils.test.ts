import { describe, test, expect } from 'bun:test'
import { expandTildePath } from './path-utils'

describe('expandTildePath', () => {
  const homeDir = '/home/user'

  describe('tilde expansion', () => {
    test('expands lone tilde to home directory', () => {
      expect(expandTildePath('~', homeDir)).toBe('/home/user')
    })

    test('expands tilde with path to full path', () => {
      expect(expandTildePath('~/Documents', homeDir)).toBe('/home/user/Documents')
    })

    test('expands nested paths', () => {
      expect(expandTildePath('~/Projects/app/src', homeDir)).toBe('/home/user/Projects/app/src')
    })
  })

  describe('no expansion needed', () => {
    test('returns absolute path unchanged', () => {
      expect(expandTildePath('/usr/local/bin', homeDir)).toBe('/usr/local/bin')
    })

    test('returns relative path unchanged', () => {
      expect(expandTildePath('./relative/path', homeDir)).toBe('./relative/path')
    })

    test('returns path with tilde in middle unchanged', () => {
      expect(expandTildePath('/path/~user/file', homeDir)).toBe('/path/~user/file')
    })
  })

  describe('edge cases', () => {
    test('returns empty string unchanged', () => {
      expect(expandTildePath('', homeDir)).toBe('')
    })

    test('returns null-ish values unchanged', () => {
      // @ts-expect-error - testing edge case
      expect(expandTildePath(null, homeDir)).toBeFalsy()
      // @ts-expect-error - testing edge case
      expect(expandTildePath(undefined, homeDir)).toBeFalsy()
    })

    test('handles tilde with just slash', () => {
      expect(expandTildePath('~/', homeDir)).toBe('/home/user/')
    })

    test('does not expand tilde in the middle of path', () => {
      expect(expandTildePath('before~/after', homeDir)).toBe('before~/after')
    })

    test('handles different home directories', () => {
      expect(expandTildePath('~/test', '/Users/john')).toBe('/Users/john/test')
      expect(expandTildePath('~', '/root')).toBe('/root')
    })
  })
})
