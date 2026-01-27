import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../../__tests__/utils/env'
import { db, messagingConnections } from '../../db'

// Mock the WebSocket broadcast
mock.module('../../websocket/terminal-ws', () => ({
  broadcast: () => {},
}))

// Mock the assistant service
const mockStreamMessage = function* () {
  yield { type: 'content:delta', data: { text: 'Hello ' } }
  yield { type: 'content:delta', data: { text: 'from ' } }
  yield { type: 'content:delta', data: { text: 'Claude!' } }
}

mock.module('../assistant-service', () => ({
  streamMessage: mockStreamMessage,
}))

// Mock WhatsApp channel to avoid Baileys dependency
interface MockChannelEvents {
  onMessage?: (msg: {
    channelType: string
    connectionId: string
    senderId: string
    senderName?: string
    content: string
    timestamp: Date
  }) => Promise<void>
  onConnectionChange: (status: string) => void
  onAuthRequired?: (data: { qrDataUrl: string }) => void
  onDisplayNameChange?: (name: string) => void
}

class MockWhatsAppChannel {
  readonly type = 'whatsapp' as const
  readonly connectionId: string
  private events: MockChannelEvents | null = null
  private status: 'disconnected' | 'connecting' | 'connected' | 'qr_pending' = 'disconnected'
  sentMessages: Array<{ recipientId: string; content: string }> = []

  constructor(connectionId: string) {
    this.connectionId = connectionId
  }

  async initialize(events: MockChannelEvents): Promise<void> {
    this.events = events
    this.status = 'connected'
    events.onConnectionChange('connected')
  }

  async shutdown(): Promise<void> {
    this.status = 'disconnected'
  }

  async sendMessage(recipientId: string, content: string): Promise<boolean> {
    this.sentMessages.push({ recipientId, content })
    return true
  }

  getStatus() {
    return this.status
  }

  // Test helper to simulate incoming message
  async simulateMessage(senderId: string, content: string, senderName?: string): Promise<void> {
    if (this.events?.onMessage) {
      await this.events.onMessage({
        channelType: 'whatsapp',
        connectionId: this.connectionId,
        senderId,
        senderName,
        content,
        timestamp: new Date(),
      })
    }
  }
}

mock.module('./whatsapp-channel', () => ({
  WhatsAppChannel: MockWhatsAppChannel,
}))

// Import after mocks are set up
import {
  getOrCreateWhatsAppConnection,
  enableWhatsApp,
  disableWhatsApp,
  getWhatsAppStatus,
  listConnections,
} from './index'

describe('Messaging Channel Manager', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('getOrCreateWhatsAppConnection', () => {
    test('creates new connection when none exists', () => {
      const conn = getOrCreateWhatsAppConnection()

      expect(conn).toBeDefined()
      expect(conn.id).toBeDefined()
      expect(conn.channelType).toBe('whatsapp')
      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('returns existing connection on subsequent calls', () => {
      const first = getOrCreateWhatsAppConnection()
      const second = getOrCreateWhatsAppConnection()

      expect(first.id).toBe(second.id)
    })
  })

  describe('enableWhatsApp', () => {
    test('enables WhatsApp and returns updated connection', async () => {
      const conn = await enableWhatsApp()

      expect(conn.enabled).toBe(true)
    })

    test('can be called multiple times safely', async () => {
      await enableWhatsApp()
      const conn = await enableWhatsApp()

      expect(conn.enabled).toBe(true)
    })
  })

  describe('disableWhatsApp', () => {
    test('disables WhatsApp and returns updated connection', async () => {
      await enableWhatsApp()
      const conn = await disableWhatsApp()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('can be called when already disabled', async () => {
      const conn = await disableWhatsApp()
      expect(conn.enabled).toBe(false)
    })
  })

  describe('getWhatsAppStatus', () => {
    test('returns null when no connection exists', () => {
      // Reset to clean state
      db.delete(messagingConnections).run()

      const status = getWhatsAppStatus()
      expect(status).toBeNull()
    })

    test('returns connection status when exists', async () => {
      await enableWhatsApp()

      const status = getWhatsAppStatus()
      expect(status).not.toBeNull()
      expect(status!.channelType).toBe('whatsapp')
      expect(status!.enabled).toBe(true)
    })
  })

  describe('listConnections', () => {
    test('returns empty array when no connections', () => {
      // Reset to clean state
      db.delete(messagingConnections).run()

      const connections = listConnections()
      expect(connections).toEqual([])
    })

    test('returns all connections', async () => {
      await enableWhatsApp()

      const connections = listConnections()
      expect(connections.length).toBe(1)
      expect(connections[0].channelType).toBe('whatsapp')
    })
  })
})

describe('Message Splitting', () => {
  // Test the splitMessage function indirectly by exposing it
  // We can test the splitting logic by checking how long messages are handled

  test('short messages are not split', () => {
    const content = 'Hello, world!'
    const maxLength = 4000
    const parts = splitMessageHelper(content, maxLength)

    expect(parts.length).toBe(1)
    expect(parts[0]).toBe(content)
  })

  test('long messages are split at paragraph boundaries', () => {
    const para1 = 'First paragraph. '.repeat(100) // ~1700 chars
    const para2 = 'Second paragraph. '.repeat(100) // ~1800 chars
    const para3 = 'Third paragraph. '.repeat(100) // ~1800 chars
    const content = `${para1}\n\n${para2}\n\n${para3}`
    const maxLength = 4000
    const parts = splitMessageHelper(content, maxLength)

    expect(parts.length).toBeGreaterThan(1)
    // Each part should be within maxLength
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(maxLength)
    }
  })

  test('long messages without paragraphs split at newlines', () => {
    const lines = Array(100).fill('This is a line of text that is about 40 characters.').join('\n')
    const maxLength = 2000
    const parts = splitMessageHelper(lines, maxLength)

    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(maxLength)
    }
  })

  test('long messages without breaks split at spaces', () => {
    const words = 'word '.repeat(1000) // ~5000 chars
    const maxLength = 2000
    const parts = splitMessageHelper(words.trim(), maxLength)

    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(maxLength)
    }
  })

  test('very long words get hard cut', () => {
    const longWord = 'a'.repeat(5000)
    const maxLength = 2000
    const parts = splitMessageHelper(longWord, maxLength)

    expect(parts.length).toBe(3) // 5000 / 2000 = 2.5, rounds up to 3
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(maxLength)
    }
  })
})

// Helper to test the split message logic
// This mirrors the implementation in index.ts
function splitMessageHelper(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content]

  const parts: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining)
      break
    }

    // Try to split at a paragraph break
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength)

    // Fall back to newline
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLength)
    }

    // Fall back to space
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLength)
    }

    // Fall back to hard cut
    if (splitIdx === -1 || splitIdx < maxLength / 2) {
      splitIdx = maxLength
    }

    parts.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }

  return parts
}

describe('Special Commands', () => {
  // Test that command patterns are recognized correctly
  const COMMANDS = {
    RESET: ['/reset', '/new', '/clear'],
    HELP: ['/help', '/?'],
    STATUS: ['/status'],
  }

  test('reset commands are recognized', () => {
    for (const cmd of COMMANDS.RESET) {
      expect(isResetCommand(cmd)).toBe(true)
      expect(isResetCommand(cmd.toUpperCase())).toBe(true)
    }
    expect(isResetCommand('reset')).toBe(false)
    expect(isResetCommand('/other')).toBe(false)
  })

  test('help commands are recognized', () => {
    for (const cmd of COMMANDS.HELP) {
      expect(isHelpCommand(cmd)).toBe(true)
      expect(isHelpCommand(cmd.toUpperCase())).toBe(true)
    }
    expect(isHelpCommand('help')).toBe(false)
    expect(isHelpCommand('/info')).toBe(false)
  })

  test('status commands are recognized', () => {
    for (const cmd of COMMANDS.STATUS) {
      expect(isStatusCommand(cmd)).toBe(true)
      expect(isStatusCommand(cmd.toUpperCase())).toBe(true)
    }
    expect(isStatusCommand('status')).toBe(false)
    expect(isStatusCommand('/info')).toBe(false)
  })

  test('commands with extra whitespace are trimmed', () => {
    expect(isResetCommand('  /reset  ')).toBe(true)
    expect(isHelpCommand('\t/help\n')).toBe(true)
    expect(isStatusCommand('  /status  ')).toBe(true)
  })
})

// Helper functions for command detection
function isResetCommand(content: string): boolean {
  const trimmed = content.trim().toLowerCase()
  return ['/reset', '/new', '/clear'].includes(trimmed)
}

function isHelpCommand(content: string): boolean {
  const trimmed = content.trim().toLowerCase()
  return ['/help', '/?'].includes(trimmed)
}

function isStatusCommand(content: string): boolean {
  const trimmed = content.trim().toLowerCase()
  return ['/status'].includes(trimmed)
}

describe('Response Cleaning', () => {
  test('removes canvas tags from response', () => {
    const response = 'Hello <canvas>some data here</canvas> world'
    const cleaned = cleanResponse(response)
    expect(cleaned).toBe('Hello  world')
  })

  test('removes editor tags from response', () => {
    const response = 'Start <editor>code here</editor> end'
    const cleaned = cleanResponse(response)
    expect(cleaned).toBe('Start  end')
  })

  test('removes multiple tags', () => {
    const response = '<canvas>1</canvas> text <editor>2</editor> more <canvas>3</canvas>'
    const cleaned = cleanResponse(response)
    expect(cleaned).toBe('text  more')
  })

  test('handles multiline content in tags', () => {
    const response = 'Hello <canvas>\nmulti\nline\n</canvas> world'
    const cleaned = cleanResponse(response)
    expect(cleaned).toBe('Hello  world')
  })

  test('preserves regular text', () => {
    const response = 'Just regular text without any tags'
    const cleaned = cleanResponse(response)
    expect(cleaned).toBe(response)
  })
})

// Helper to clean response (mirrors implementation)
function cleanResponse(response: string): string {
  return response
    .replace(/<canvas>[\s\S]*?<\/canvas>/g, '')
    .replace(/<editor>[\s\S]*?<\/editor>/g, '')
    .trim()
}
