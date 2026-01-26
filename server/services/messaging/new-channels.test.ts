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

// Base mock channel class for all channels
class BaseMockChannel {
  readonly connectionId: string
  protected events: MockChannelEvents | null = null
  protected status: 'disconnected' | 'connecting' | 'connected' | 'qr_pending' = 'disconnected'
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

  async logout(): Promise<void> {
    this.status = 'disconnected'
  }
}

class MockWhatsAppChannel extends BaseMockChannel {
  readonly type = 'whatsapp' as const
}

class MockDiscordChannel extends BaseMockChannel {
  readonly type = 'discord' as const
}

class MockTelegramChannel extends BaseMockChannel {
  readonly type = 'telegram' as const
}

class MockSlackChannel extends BaseMockChannel {
  readonly type = 'slack' as const
}

mock.module('./whatsapp-channel', () => ({
  WhatsAppChannel: MockWhatsAppChannel,
}))

mock.module('./discord-channel', () => ({
  DiscordChannel: MockDiscordChannel,
}))

mock.module('./telegram-channel', () => ({
  TelegramChannel: MockTelegramChannel,
}))

mock.module('./slack-channel', () => ({
  SlackChannel: MockSlackChannel,
}))

// Import after mocks are set up
import {
  // Discord
  getOrCreateDiscordConnection,
  enableDiscord,
  disableDiscord,
  getDiscordStatus,
  disconnectDiscord,
  // Telegram
  getOrCreateTelegramConnection,
  enableTelegram,
  disableTelegram,
  getTelegramStatus,
  disconnectTelegram,
  // Slack
  getOrCreateSlackConnection,
  enableSlack,
  disableSlack,
  getSlackStatus,
  disconnectSlack,
  // Common
  listConnections,
} from './index'

describe('Discord Channel Manager', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('getOrCreateDiscordConnection', () => {
    test('creates new connection when none exists', () => {
      const conn = getOrCreateDiscordConnection()

      expect(conn).toBeDefined()
      expect(conn.id).toBeDefined()
      expect(conn.channelType).toBe('discord')
      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('returns existing connection on subsequent calls', () => {
      const first = getOrCreateDiscordConnection()
      const second = getOrCreateDiscordConnection()

      expect(first.id).toBe(second.id)
    })
  })

  describe('enableDiscord', () => {
    test('enables Discord with bot token and returns updated connection', async () => {
      const conn = await enableDiscord('test-bot-token')

      expect(conn.enabled).toBe(true)
      expect(conn.authState).toBeDefined()

      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('test-bot-token')
    })

    test('can be called multiple times safely', async () => {
      await enableDiscord('token1')
      const conn = await enableDiscord('token2')

      expect(conn.enabled).toBe(true)
      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('token2')
    })
  })

  describe('disableDiscord', () => {
    test('disables Discord and returns updated connection', async () => {
      await enableDiscord('test-token')
      const conn = await disableDiscord()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('can be called when already disabled', async () => {
      const conn = await disableDiscord()
      expect(conn.enabled).toBe(false)
    })
  })

  describe('disconnectDiscord', () => {
    test('disconnects and clears auth state', async () => {
      await enableDiscord('test-token')
      const conn = await disconnectDiscord()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
      expect(conn.authState).toBeNull()
      expect(conn.displayName).toBeNull()
    })
  })

  describe('getDiscordStatus', () => {
    test('returns null when no connection exists', () => {
      db.delete(messagingConnections).run()

      const status = getDiscordStatus()
      expect(status).toBeNull()
    })

    test('returns connection status when exists', async () => {
      await enableDiscord('test-token')

      const status = getDiscordStatus()
      expect(status).not.toBeNull()
      expect(status!.channelType).toBe('discord')
      expect(status!.enabled).toBe(true)
    })
  })
})

describe('Telegram Channel Manager', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('getOrCreateTelegramConnection', () => {
    test('creates new connection when none exists', () => {
      const conn = getOrCreateTelegramConnection()

      expect(conn).toBeDefined()
      expect(conn.id).toBeDefined()
      expect(conn.channelType).toBe('telegram')
      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('returns existing connection on subsequent calls', () => {
      const first = getOrCreateTelegramConnection()
      const second = getOrCreateTelegramConnection()

      expect(first.id).toBe(second.id)
    })
  })

  describe('enableTelegram', () => {
    test('enables Telegram with bot token and returns updated connection', async () => {
      const conn = await enableTelegram('test-bot-token')

      expect(conn.enabled).toBe(true)
      expect(conn.authState).toBeDefined()

      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('test-bot-token')
    })

    test('can be called multiple times safely', async () => {
      await enableTelegram('token1')
      const conn = await enableTelegram('token2')

      expect(conn.enabled).toBe(true)
      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('token2')
    })
  })

  describe('disableTelegram', () => {
    test('disables Telegram and returns updated connection', async () => {
      await enableTelegram('test-token')
      const conn = await disableTelegram()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('can be called when already disabled', async () => {
      const conn = await disableTelegram()
      expect(conn.enabled).toBe(false)
    })
  })

  describe('disconnectTelegram', () => {
    test('disconnects and clears auth state', async () => {
      await enableTelegram('test-token')
      const conn = await disconnectTelegram()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
      expect(conn.authState).toBeNull()
      expect(conn.displayName).toBeNull()
    })
  })

  describe('getTelegramStatus', () => {
    test('returns null when no connection exists', () => {
      db.delete(messagingConnections).run()

      const status = getTelegramStatus()
      expect(status).toBeNull()
    })

    test('returns connection status when exists', async () => {
      await enableTelegram('test-token')

      const status = getTelegramStatus()
      expect(status).not.toBeNull()
      expect(status!.channelType).toBe('telegram')
      expect(status!.enabled).toBe(true)
    })
  })
})

describe('Slack Channel Manager', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  describe('getOrCreateSlackConnection', () => {
    test('creates new connection when none exists', () => {
      const conn = getOrCreateSlackConnection()

      expect(conn).toBeDefined()
      expect(conn.id).toBeDefined()
      expect(conn.channelType).toBe('slack')
      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('returns existing connection on subsequent calls', () => {
      const first = getOrCreateSlackConnection()
      const second = getOrCreateSlackConnection()

      expect(first.id).toBe(second.id)
    })
  })

  describe('enableSlack', () => {
    test('enables Slack with bot and app tokens and returns updated connection', async () => {
      const conn = await enableSlack('xoxb-test-bot-token', 'xapp-test-app-token')

      expect(conn.enabled).toBe(true)
      expect(conn.authState).toBeDefined()

      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('xoxb-test-bot-token')
      expect(authState.appToken).toBe('xapp-test-app-token')
    })

    test('can be called multiple times safely', async () => {
      await enableSlack('bot1', 'app1')
      const conn = await enableSlack('bot2', 'app2')

      expect(conn.enabled).toBe(true)
      const authState = JSON.parse(conn.authState!)
      expect(authState.botToken).toBe('bot2')
      expect(authState.appToken).toBe('app2')
    })
  })

  describe('disableSlack', () => {
    test('disables Slack and returns updated connection', async () => {
      await enableSlack('bot-token', 'app-token')
      const conn = await disableSlack()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
    })

    test('can be called when already disabled', async () => {
      const conn = await disableSlack()
      expect(conn.enabled).toBe(false)
    })
  })

  describe('disconnectSlack', () => {
    test('disconnects and clears auth state', async () => {
      await enableSlack('bot-token', 'app-token')
      const conn = await disconnectSlack()

      expect(conn.enabled).toBe(false)
      expect(conn.status).toBe('disconnected')
      expect(conn.authState).toBeNull()
      expect(conn.displayName).toBeNull()
    })
  })

  describe('getSlackStatus', () => {
    test('returns null when no connection exists', () => {
      db.delete(messagingConnections).run()

      const status = getSlackStatus()
      expect(status).toBeNull()
    })

    test('returns connection status when exists', async () => {
      await enableSlack('bot-token', 'app-token')

      const status = getSlackStatus()
      expect(status).not.toBeNull()
      expect(status!.channelType).toBe('slack')
      expect(status!.enabled).toBe(true)
    })
  })
})

describe('Multiple Channels', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
  })

  afterEach(() => {
    testEnv.cleanup()
  })

  test('all channels can be enabled simultaneously', async () => {
    await enableDiscord('discord-token')
    await enableTelegram('telegram-token')
    await enableSlack('slack-bot', 'slack-app')

    const connections = listConnections()

    const discord = connections.find(c => c.channelType === 'discord')
    const telegram = connections.find(c => c.channelType === 'telegram')
    const slack = connections.find(c => c.channelType === 'slack')

    expect(discord).toBeDefined()
    expect(discord!.enabled).toBe(true)

    expect(telegram).toBeDefined()
    expect(telegram!.enabled).toBe(true)

    expect(slack).toBeDefined()
    expect(slack!.enabled).toBe(true)
  })

  test('disabling one channel does not affect others', async () => {
    await enableDiscord('discord-token')
    await enableTelegram('telegram-token')
    await enableSlack('slack-bot', 'slack-app')

    await disableDiscord()

    const connections = listConnections()

    const discord = connections.find(c => c.channelType === 'discord')
    const telegram = connections.find(c => c.channelType === 'telegram')
    const slack = connections.find(c => c.channelType === 'slack')

    expect(discord!.enabled).toBe(false)
    expect(telegram!.enabled).toBe(true)
    expect(slack!.enabled).toBe(true)
  })
})
