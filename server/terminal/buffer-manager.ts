// Buffer manager for terminal scrollback
// Stores raw terminal output without parsing to preserve escape sequences

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import * as path from 'path'
import { getViboraDir } from '../lib/settings'

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

  getContents(): string {
    return this.chunks.map((c) => c.data).join('')
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
      console.error(`[BufferManager] Failed to save buffer for ${this.terminalId}:`, err)
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
        console.log(`[BufferManager] Loaded ${this.totalBytes} bytes for ${this.terminalId}`)
      } else {
        console.log(`[BufferManager] No buffer file for ${this.terminalId}`)
      }
    } catch (err) {
      console.error(`[BufferManager] Failed to load buffer for ${this.terminalId}:`, err)
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
