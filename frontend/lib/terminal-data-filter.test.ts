import { describe, test, expect } from 'bun:test'
import { shouldDropTerminalData } from './terminal-data-filter'

const ESC = '\x1b'

describe('shouldDropTerminalData', () => {
  describe('pasted text containing $y is NOT dropped (regression)', () => {
    // A clipboard paste arrives as a single onData event. The previous
    // unanchored /\$y/ rule silently dropped any paste containing "$y",
    // so these would never reach the PTY.
    test('echo "$year"', () => {
      expect(shouldDropTerminalData('echo "$year"')).toBe(false)
    })

    test('$yaml on its own', () => {
      expect(shouldDropTerminalData('$yaml')).toBe(false)
    })

    test('export PY=$y', () => {
      expect(shouldDropTerminalData('export PY=$y')).toBe(false)
    })

    test('bare $y substring', () => {
      expect(shouldDropTerminalData('foo $y bar')).toBe(false)
    })

    test('multiline paste with $y', () => {
      expect(shouldDropTerminalData('line1\necho "$year"\nline3')).toBe(false)
    })
  })

  describe('real DECRPM / DECRQSS responses ARE dropped', () => {
    // Real responses are CSI sequences terminated by $y, e.g. ESC[?2026;2$y
    // (see server/terminal/buffer-manager.test.ts for the canonical form).
    test('single DECRPM response', () => {
      expect(shouldDropTerminalData(`${ESC}[?2026;2$y`)).toBe(true)
    })

    test('batched DECRPM responses in one event', () => {
      expect(shouldDropTerminalData(`${ESC}[?1016;2$y${ESC}[?2027;0$y`)).toBe(true)
    })

    test('DECRPM response without private marker', () => {
      expect(shouldDropTerminalData(`${ESC}[2026;2$y`)).toBe(true)
    })
  })

  describe('other xterm-generated responses are still dropped', () => {
    test('mouse motion (SGR button 35)', () => {
      expect(shouldDropTerminalData(`${ESC}[<35;10;20M`)).toBe(true)
    })

    test('OSC color/capability response', () => {
      expect(shouldDropTerminalData(`${ESC}]11;rgb:0a0a/0a0a/0a0a`)).toBe(true)
    })

    test('DCS sequence (ESC P)', () => {
      expect(shouldDropTerminalData(`${ESC}P1$r0m`)).toBe(true)
    })

    test('CPR (cursor position report)', () => {
      expect(shouldDropTerminalData(`${ESC}[12;34R`)).toBe(true)
    })

    test('DA (device attributes) response', () => {
      expect(shouldDropTerminalData(`${ESC}[?62;1;6c`)).toBe(true)
    })
  })

  describe('ordinary typed/pasted input is preserved', () => {
    test('plain text', () => {
      expect(shouldDropTerminalData('hello world')).toBe(false)
    })

    test('single typed character', () => {
      expect(shouldDropTerminalData('a')).toBe(false)
    })

    test('empty string', () => {
      expect(shouldDropTerminalData('')).toBe(false)
    })

    test('text that mentions R but is not a CPR', () => {
      expect(shouldDropTerminalData('press R to retry')).toBe(false)
    })

    test('escape key press alone', () => {
      expect(shouldDropTerminalData(ESC)).toBe(false)
    })
  })
})
