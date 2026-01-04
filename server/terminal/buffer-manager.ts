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

interface BufferFileV2 {
  version: 2
  content: string // base64 encoded
}

export class BufferManager {
  private chunks: BufferChunk[] = []
  private totalBytes: number = 0
  private terminalId: string | null = null

  setTerminalId(id: string): void {
    this.terminalId = id
  }

  append(data: string): void {
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
   * Filter out alternate screen buffer escape sequences.
   * TUI applications like OpenCode use these to switch to a full-screen mode
   * that doesn't preserve scrollback. By filtering them, we ensure the content
   * goes to the main buffer where scrollback is preserved.
   */
  private filterAlternateScreenSequences(data: string): string {
    return data
      // ESC[?1049h/l - save cursor & switch to/from alternate screen (most common)
      .replace(/\x1b\[\?1049[hl]/g, '')
      // ESC[?47h/l - older alternate screen switch
      .replace(/\x1b\[\?47[hl]/g, '')
      // ESC[?1047h/l - alternate screen without cursor save
      .replace(/\x1b\[\?1047[hl]/g, '')
  }

  getContents(): string {
    const raw = this.chunks.map((c) => c.data).join('')
    return this.filterAlternateScreenSequences(raw)
  }

  clear(): void {
    this.chunks = []
    this.totalBytes = 0
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
      const content = this.getContents()
      const fileData: BufferFileV2 = {
        version: 2,
        content: Buffer.from(content).toString('base64'),
      }
      writeFileSync(filePath, JSON.stringify(fileData), 'utf-8')
    } catch (err) {
      log.buffer.error('Failed to save buffer', { terminalId: this.terminalId, error: String(err) })
    }
  }

  // Load buffer from disk, auto-migrating legacy format
  loadFromDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')

        let content: string
        try {
          const parsed = JSON.parse(raw)
          if (parsed.version === 2 && typeof parsed.content === 'string') {
            // V2 format: base64 encoded
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
