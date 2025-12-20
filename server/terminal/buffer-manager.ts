// Buffer manager for terminal scrollback

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import * as path from 'path'
import { getViboraDir } from '../lib/settings'

const MAX_BUFFER_LINES = 10000
const MAX_LINE_LENGTH = 2000

function getBuffersDir(): string {
  const dir = path.join(getViboraDir(), 'buffers')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export class BufferManager {
  private lines: string[] = []
  private partialLine: string = ''
  private terminalId: string | null = null

  setTerminalId(id: string): void {
    this.terminalId = id
  }

  append(data: string): void {
    const combined = this.partialLine + data
    const parts = combined.split('\n')

    // Last part might be incomplete (no trailing newline)
    this.partialLine = parts.pop() || ''

    for (const line of parts) {
      // Truncate extremely long lines
      const truncated = line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + '...'
        : line
      this.lines.push(truncated)
    }

    // Trim buffer if it exceeds max lines
    if (this.lines.length > MAX_BUFFER_LINES) {
      this.lines = this.lines.slice(-MAX_BUFFER_LINES)
    }
  }

  getContents(): string {
    const content = this.lines.join('\n')
    if (this.partialLine) {
      return content + '\n' + this.partialLine
    }
    return content
  }

  clear(): void {
    this.lines = []
    this.partialLine = ''
  }

  getLineCount(): number {
    return this.lines.length + (this.partialLine ? 1 : 0)
  }

  // Save buffer to disk
  saveToDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      writeFileSync(filePath, this.getContents(), 'utf-8')
    } catch (err) {
      console.error(`[BufferManager] Failed to save buffer for ${this.terminalId}:`, err)
    }
  }

  // Load buffer from disk
  loadFromDisk(): void {
    if (!this.terminalId) return
    const filePath = path.join(getBuffersDir(), `${this.terminalId}.buf`)
    try {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8')
        // Parse content back into lines
        this.lines = content.split('\n')
        this.partialLine = ''
        console.log(`[BufferManager] Loaded ${this.lines.length} lines for ${this.terminalId}`)
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
