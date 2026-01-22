import { describe, test, expect } from 'bun:test'
import { parseSemver, compareVersions, compareIdentifiers } from './semver'

describe('semver', () => {
  describe('parseSemver', () => {
    test('parses basic version', () => {
      const result = parseSemver('1.2.3')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3, preRelease: [] })
    })

    test('parses version with v prefix', () => {
      const result = parseSemver('v1.2.3')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3, preRelease: [] })
    })

    test('parses version with pre-release', () => {
      const result = parseSemver('1.2.3-beta.1')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3, preRelease: ['beta', 1] })
    })

    test('parses version with build metadata (ignores it)', () => {
      const result = parseSemver('1.2.3+build.123')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3, preRelease: [] })
    })

    test('parses version with pre-release and build metadata', () => {
      const result = parseSemver('1.2.3-alpha.1+build.456')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3, preRelease: ['alpha', 1] })
    })

    test('handles two-part version', () => {
      const result = parseSemver('1.2')
      expect(result).toEqual({ major: 1, minor: 2, patch: 0, preRelease: [] })
    })

    test('handles single-part version', () => {
      const result = parseSemver('1')
      expect(result).toEqual({ major: 1, minor: 0, patch: 0, preRelease: [] })
    })

    test('returns null for invalid version', () => {
      expect(parseSemver('not.a.version')).toBe(null)
      expect(parseSemver('1.2.3.4')).toBe(null)
      expect(parseSemver('')).toBe(null)
    })

    test('rejects leading zeros', () => {
      expect(parseSemver('01.2.3')).toBe(null)
      expect(parseSemver('1.02.3')).toBe(null)
      expect(parseSemver('1.2.03')).toBe(null)
    })

    test('allows zero versions', () => {
      expect(parseSemver('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0, preRelease: [] })
      expect(parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, preRelease: [] })
    })
  })

  describe('compareIdentifiers', () => {
    test('numbers compare numerically', () => {
      expect(compareIdentifiers(1, 2)).toBeLessThan(0)
      expect(compareIdentifiers(2, 1)).toBeGreaterThan(0)
      expect(compareIdentifiers(1, 1)).toBe(0)
    })

    test('strings compare lexically', () => {
      expect(compareIdentifiers('alpha', 'beta')).toBeLessThan(0)
      expect(compareIdentifiers('beta', 'alpha')).toBeGreaterThan(0)
      expect(compareIdentifiers('alpha', 'alpha')).toBe(0)
    })

    test('numbers sort before strings', () => {
      expect(compareIdentifiers(1, 'alpha')).toBeLessThan(0)
      expect(compareIdentifiers('alpha', 1)).toBeGreaterThan(0)
    })
  })

  describe('compareVersions', () => {
    test('compares major versions', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    })

    test('compares minor versions', () => {
      expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0)
      expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0)
    })

    test('compares patch versions', () => {
      expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0)
      expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0)
    })

    test('equal versions return 0', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    })

    test('release > pre-release', () => {
      expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0)
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
    })

    test('compares pre-release versions', () => {
      expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)
      expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.1')).toBeGreaterThan(0)
    })

    test('longer pre-release > shorter when prefix matches', () => {
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBeGreaterThan(0)
    })

    test('handles v prefix', () => {
      expect(compareVersions('v1.2.0', '1.1.0')).toBeGreaterThan(0)
      expect(compareVersions('1.2.0', 'v1.1.0')).toBeGreaterThan(0)
    })

    test('returns 0 for invalid versions', () => {
      expect(compareVersions('invalid', '1.0.0')).toBe(0)
      expect(compareVersions('1.0.0', 'invalid')).toBe(0)
    })
  })
})
