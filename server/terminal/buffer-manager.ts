// Buffer manager for terminal scrollback
// Stores raw terminal output without parsing to preserve escape sequences

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import * as path from 'path'
import { getViboraDir } from '../lib/settings'
import { log } from '../lib/logger'

// 1MB total buffer size limit
const MAX_BUFFER_BYTES = 1_000_000

function getBuffersDir(): string {
  const dir = path.join(getViboraDir(), 'buffers')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

interface BufferChunk {
  data: string
  timestamp: number
}

interface BufferFileV3 {
  version: 3
  content: string // base64 encoded
  mouseMode: {
    x10: boolean
    buttonEvent: boolean
    anyEvent: boolean
    sgr: boolean
  }
}

export class BufferManager {
  private chunks: BufferChunk[] = []
  private totalBytes: number = 0
  private terminalId: string | null = null

  // Track mouse tracking mode state so we can restore it after buffer replay.
  // When old chunks are evicted, we may lose the original enable sequences,
  // but we still know the current state and can re-apply it.
  private mouseMode = {
    x10: false, // ESC[?1000h/l - Basic mouse tracking (X10)
    buttonEvent: false, // ESC[?1002h/l - Button event tracking
    anyEvent: false, // ESC[?1003h/l - Any event (all motion) tracking
    sgr: false, // ESC[?1006h/l - SGR extended mouse mode
  }

  setTerminalId(id: string): void {
    this.terminalId = id
  }

  append(data: string): void {
    // Track mouse mode changes before storing
    this.trackMouseModes(data)

    // Store raw data without any parsing - preserves escape sequences
    this.chunks.push({ data, timestamp: Date.now() })
    this.totalBytes += data.length

    // Evict oldest chunks if over limit
    while (this.totalBytes > MAX_BUFFER_BYTES && this.chunks.length > 1) {
      const removed = this.chunks.shift()!
      this.totalBytes -= removed.data.length
    }
  }

  /**
   * Track mouse mode enable/disable sequences in the output.
   * This allows us to restore the correct state even if the original
   * sequences were evicted from the buffer.
   */
  private trackMouseModes(data: string): void {
    const ESC = '\u001b'
    // Check for mouse mode sequences
    if (new RegExp(`${ESC}\\[\\?1000h`).test(data)) this.mouseMode.x10 = true
    if (new RegExp(`${ESC}\\[\\?1000l`).test(data)) this.mouseMode.x10 = false
    if (new RegExp(`${ESC}\\[\\?1002h`).test(data)) this.mouseMode.buttonEvent = true
    if (new RegExp(`${ESC}\\[\\?1002l`).test(data)) this.mouseMode.buttonEvent = false
    if (new RegExp(`${ESC}\\[\\?1003h`).test(data)) this.mouseMode.anyEvent = true
    if (new RegExp(`${ESC}\\[\\?1003l`).test(data)) this.mouseMode.anyEvent = false
    if (new RegExp(`${ESC}\\[\\?1006h`).test(data)) this.mouseMode.sgr = true
    if (new RegExp(`${ESC}\\[\\?1006l`).test(data)) this.mouseMode.sgr = false
  }

  /**
   * Generate escape sequences to restore the current mouse mode state.
   */
  private getMouseModeSequences(): string {
    const ESC = '\u001b'
    let sequences = ''
    if (this.mouseMode.x10) sequences += `${ESC}[?1000h`
    if (this.mouseMode.buttonEvent) sequences += `${ESC}[?1002h`
    if (this.mouseMode.anyEvent) sequences += `${ESC}[?1003h`
    if (this.mouseMode.sgr) sequences += `${ESC}[?1006h`
    return sequences
  }

  /**
   * Filter out escape sequences that cause display issues when replaying buffer.
   */
  private filterProblematicSequences(data: string): string {
    // Using RegExp constructor to avoid eslint no-control-regex warnings
    // ESC = \x1b = \u001b
    const ESC = '\u001b'
    return data
      // Alternate screen buffer sequences (TUI apps like OpenCode)
      // ESC[?1049h/l - save cursor & switch to/from alternate screen (most common)
      .replace(new RegExp(`${ESC}\\[\\?1049[hl]`, 'g'), '')
      // ESC[?47h/l - older alternate screen switch
      .replace(new RegExp(`${ESC}\\[\\?47[hl]`, 'g'), '')
      // ESC[?1047h/l - alternate screen without cursor save
      .replace(new RegExp(`${ESC}\\[\\?1047[hl]`, 'g'), '')
      // DECRQSS responses - terminal capability query responses
      // Pattern: digits;digits$y (e.g., "1016;2$y2027;0$y...")
      .replace(/\d+;\d+\$y/g, '')
      // CPR (Cursor Position Report) responses - ESC[row;colR
      .replace(new RegExp(`${ESC}\\[\\d+;\\d+R`, 'g'), '')
      // DA (Device Attributes) responses - ESC[...c
      .replace(new RegExp(`${ESC}\\[[\\?>\\d;]*c`, 'g'), '')
      // Bare R characters from stripped responses
      .replace(/(?<![a-zA-Z])R+(?![a-zA-Z])/g, '')
  }

  getContents(): string {
    const raw = this.chunks.map((c) => c.data).join('')
    const filtered = this.filterProblematicSequences(raw)
    // Prepend mouse mode sequences to restore the current state.
    // This ensures mouse tracking works correctly after buffer replay,
    // even if the original enable sequences were evicted from the buffer.
    return this.getMouseModeSequences() + filtered
  }

  clear(): void {
    this.chunks = []
    this.totalBytes = 0
    this.mouseMode = { x10: false, buttonEvent: false, anyEvent: false, sgr: false }
  }

  getLineCount(): number {
    // Approximate line count for compatibility
    const content = this.getContents()
    return content.split('\n').length
  }

  // Save buffer to disk using base64 encoding to preserve all bytes
  saveToDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      // Get raw content without prepending mouse mode (we save state separately)
      const raw = this.chunks.map((c) => c.data).join('')
      const content = this.filterProblematicSequences(raw)
      const fileData: BufferFileV3 = {
        version: 3,
        content: Buffer.from(content).toString('base64'),
        mouseMode: { ...this.mouseMode },
      }
      writeFileSync(filePath, JSON.stringify(fileData), 'utf-8')
    } catch (err) {
      log.buffer.error('Failed to save buffer', { terminalId: this.terminalId, error: String(err) })
    }
  }

  // Load buffer from disk, auto-migrating legacy formats
  loadFromDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')

        let content: string
        try {
          const parsed = JSON.parse(raw)
          if (parsed.version === 3 && typeof parsed.content === 'string') {
            // V3 format: base64 encoded with mouse mode state
            content = Buffer.from(parsed.content, 'base64').toString()
            if (parsed.mouseMode) {
              this.mouseMode = {
                x10: !!parsed.mouseMode.x10,
                buttonEvent: !!parsed.mouseMode.buttonEvent,
                anyEvent: !!parsed.mouseMode.anyEvent,
                sgr: !!parsed.mouseMode.sgr,
              }
            }
          } else if (parsed.version === 2 && typeof parsed.content === 'string') {
            // V2 format: base64 encoded (no mouse mode)
            content = Buffer.from(parsed.content, 'base64').toString()
          } else {
            // Unknown JSON format, treat as legacy
            content = raw
          }
        } catch {
          // Not JSON, legacy plain text format
          content = raw
        }

        this.chunks = [{ data: content, timestamp: Date.now() }]
        this.totalBytes = content.length
        log.buffer.debug('Loaded buffer', { terminalId: this.terminalId, bytes: this.totalBytes })
      } else {
        log.buffer.debug('No buffer file', { terminalId: this.terminalId })
      }
    } catch (err) {
      log.buffer.error('Failed to load buffer', { terminalId: this.terminalId, error: String(err) })
    }
  }

  // Delete buffer file from disk
  deleteFromDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
    } catch {
      // Ignore errors
    }
  }
}
