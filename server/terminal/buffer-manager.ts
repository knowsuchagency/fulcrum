// Buffer manager for terminal scrollback

const MAX_BUFFER_LINES = 10000
const MAX_LINE_LENGTH = 2000

export class BufferManager {
  private lines: string[] = []
  private partialLine: string = ''

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
}
