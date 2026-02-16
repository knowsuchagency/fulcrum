import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestEnv, type TestEnv } from '../../__tests__/utils/env'
import type { MessagingChannel, ChannelEvents, ConnectionStatus, ChannelFactory } from './types'
import {
  // Discord
  configureDiscord,
  enableDiscord,
  disableDiscord,
  getDiscordStatus,
  getDiscordConfig,
  disconnectDiscord,
  // Telegram
  configureTelegram,
  enableTelegram,
  disableTelegram,
  getTelegramStatus,
  getTelegramConfig,
  disconnectTelegram,
  // Slack
  configureSlack,
  enableSlack,
  disableSlack,
  getSlackStatus,
  getSlackConfig,
  disconnectSlack,
  // Common
  stopMessagingChannels,
  // DI
  setChannelFactory,
  resetChannelFactory,
} from './index'
import { activeChannels } from './channel-manager'

// Base mock channel class for all channels (no mock.module needed)
class BaseMockChannel implements MessagingChannel {
  readonly connectionId: string
  readonly type: 'whatsapp' | 'discord' | 'telegram' | 'slack' | 'email'
  protected events: ChannelEvents | null = null
  protected status: ConnectionStatus = 'disconnected'
  sentMessages: Array<{ recipientId: string; content: string }> = []

  constructor(connectionId: string, type: 'whatsapp' | 'discord' | 'telegram' | 'slack' | 'email') {
    this.connectionId = connectionId
    this.type = type
  }

  async initialize(events: ChannelEvents): Promise<void> {
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

  getStatus(): ConnectionStatus {
    return this.status
  }

  async logout(): Promise<void> {
    this.status = 'disconnected'
  }
}

// Mock factory that creates mock channels and skips token validation
const mockChannelFactory: ChannelFactory = {
  createWhatsAppChannel: (id) => new BaseMockChannel(id, 'whatsapp'),
  createDiscordChannel: (id) => new BaseMockChannel(id, 'discord'),
  createTelegramChannel: (id) => new BaseMockChannel(id, 'telegram'),
  createSlackChannel: (id) => new BaseMockChannel(id, 'slack'),
  createEmailChannel: (id) => new BaseMockChannel(id, 'email'),
  // Mock validators that always pass
  validateDiscordToken: async () => {},
  validateTelegramToken: async () => {},
  validateSlackTokens: async () => {},
}

describe('Discord Channel Manager (settings-based)', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
    activeChannels.clear() // Extra safety: clear any stale channels from other test files
    setChannelFactory(mockChannelFactory)
  })

  afterEach(async () => {
    await stopMessagingChannels()
    resetChannelFactory()
    testEnv.cleanup()
  })

  describe('configureDiscord', () => {
    test('saves bot token to settings and enables channel', async () => {
      const result = await configureDiscord('test-bot-token')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected') // Mock channel connects immediately
    })

    test('can be called multiple times to update token', async () => {
      await configureDiscord('token1')
      const result = await configureDiscord('token2')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('enableDiscord', () => {
    test('returns error when no credentials configured', async () => {
      const result = await enableDiscord()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('credentials_required')
      expect(result.error).toBeDefined()
    })

    test('enables channel when credentials exist', async () => {
      await configureDiscord('test-token')
      await disableDiscord()

      const result = await enableDiscord()

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('disableDiscord', () => {
    test('disables channel but preserves credentials', async () => {
      await configureDiscord('test-token')
      const result = await disableDiscord()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should still exist
      const config = getDiscordConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
    })
  })

  describe('disconnectDiscord', () => {
    test('clears credentials from settings', async () => {
      await configureDiscord('test-token')
      const result = await disconnectDiscord()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should be cleared
      const config = getDiscordConfig()
      expect(config).toBeNull()
    })
  })

  describe('getDiscordStatus', () => {
    test('returns disabled when not configured', () => {
      const status = getDiscordStatus()

      expect(status.enabled).toBe(false)
      expect(status.status).toBe('disconnected')
    })

    test('returns connected when configured and running', async () => {
      await configureDiscord('test-token')

      const status = getDiscordStatus()

      expect(status.enabled).toBe(true)
      expect(status.status).toBe('connected')
    })
  })

  describe('getDiscordConfig', () => {
    test('returns null when not configured', () => {
      const config = getDiscordConfig()
      expect(config).toBeNull()
    })

    test('returns masked token when configured', async () => {
      await configureDiscord('test-token')

      const config = getDiscordConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
    })
  })
})

describe('Telegram Channel Manager (settings-based)', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
    activeChannels.clear()
    setChannelFactory(mockChannelFactory)
  })

  afterEach(async () => {
    await stopMessagingChannels()
    resetChannelFactory()
    testEnv.cleanup()
  })

  describe('configureTelegram', () => {
    test('saves bot token to settings and enables channel', async () => {
      const result = await configureTelegram('test-bot-token')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })

    test('can be called multiple times to update token', async () => {
      await configureTelegram('token1')
      const result = await configureTelegram('token2')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('enableTelegram', () => {
    test('returns error when no credentials configured', async () => {
      const result = await enableTelegram()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('credentials_required')
      expect(result.error).toBeDefined()
    })

    test('enables channel when credentials exist', async () => {
      await configureTelegram('test-token')
      await disableTelegram()

      const result = await enableTelegram()

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('disableTelegram', () => {
    test('disables channel but preserves credentials', async () => {
      await configureTelegram('test-token')
      const result = await disableTelegram()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should still exist
      const config = getTelegramConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
    })
  })

  describe('disconnectTelegram', () => {
    test('clears credentials from settings', async () => {
      await configureTelegram('test-token')
      const result = await disconnectTelegram()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should be cleared
      const config = getTelegramConfig()
      expect(config).toBeNull()
    })
  })

  describe('getTelegramStatus', () => {
    test('returns disabled when not configured', () => {
      const status = getTelegramStatus()

      expect(status.enabled).toBe(false)
      expect(status.status).toBe('disconnected')
    })

    test('returns connected when configured and running', async () => {
      await configureTelegram('test-token')

      const status = getTelegramStatus()

      expect(status.enabled).toBe(true)
      expect(status.status).toBe('connected')
    })
  })

  describe('getTelegramConfig', () => {
    test('returns null when not configured', () => {
      const config = getTelegramConfig()
      expect(config).toBeNull()
    })

    test('returns masked token when configured', async () => {
      await configureTelegram('test-token')

      const config = getTelegramConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
    })
  })
})

describe('Slack Channel Manager (settings-based)', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
    activeChannels.clear()
    setChannelFactory(mockChannelFactory)
  })

  afterEach(async () => {
    await stopMessagingChannels()
    resetChannelFactory()
    testEnv.cleanup()
  })

  describe('configureSlack', () => {
    test('saves bot and app tokens to settings and enables channel', async () => {
      const result = await configureSlack('xoxb-test-bot-token', 'xapp-test-app-token')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })

    test('can be called multiple times to update tokens', async () => {
      await configureSlack('bot1', 'app1')
      const result = await configureSlack('bot2', 'app2')

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('enableSlack', () => {
    test('returns error when no credentials configured', async () => {
      const result = await enableSlack()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('credentials_required')
      expect(result.error).toBeDefined()
    })

    test('enables channel when credentials exist', async () => {
      await configureSlack('bot-token', 'app-token')
      await disableSlack()

      const result = await enableSlack()

      expect(result.enabled).toBe(true)
      expect(result.status).toBe('connected')
    })
  })

  describe('disableSlack', () => {
    test('disables channel but preserves credentials', async () => {
      await configureSlack('bot-token', 'app-token')
      const result = await disableSlack()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should still exist
      const config = getSlackConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
      expect(config!.appToken).toBe('••••••••')
    })
  })

  describe('disconnectSlack', () => {
    test('clears credentials from settings', async () => {
      await configureSlack('bot-token', 'app-token')
      const result = await disconnectSlack()

      expect(result.enabled).toBe(false)
      expect(result.status).toBe('disconnected')

      // Credentials should be cleared
      const config = getSlackConfig()
      expect(config).toBeNull()
    })
  })

  describe('getSlackStatus', () => {
    test('returns disabled when not configured', () => {
      const status = getSlackStatus()

      expect(status.enabled).toBe(false)
      expect(status.status).toBe('disconnected')
    })

    test('returns connected when configured and running', async () => {
      await configureSlack('bot-token', 'app-token')

      const status = getSlackStatus()

      expect(status.enabled).toBe(true)
      expect(status.status).toBe('connected')
    })
  })

  describe('getSlackConfig', () => {
    test('returns null when not configured', () => {
      const config = getSlackConfig()
      expect(config).toBeNull()
    })

    test('returns masked tokens when configured', async () => {
      await configureSlack('bot-token', 'app-token')

      const config = getSlackConfig()
      expect(config).not.toBeNull()
      expect(config!.botToken).toBe('••••••••')
      expect(config!.appToken).toBe('••••••••')
    })
  })
})

describe('Multiple Channels (settings-based)', () => {
  let testEnv: TestEnv

  beforeEach(() => {
    testEnv = setupTestEnv()
    activeChannels.clear()
    setChannelFactory(mockChannelFactory)
  })

  afterEach(async () => {
    await stopMessagingChannels()
    resetChannelFactory()
    testEnv.cleanup()
  })

  test('all channels can be enabled simultaneously', async () => {
    await configureDiscord('discord-token')
    await configureTelegram('telegram-token')
    await configureSlack('slack-bot', 'slack-app')

    const discordStatus = getDiscordStatus()
    const telegramStatus = getTelegramStatus()
    const slackStatus = getSlackStatus()

    expect(discordStatus.enabled).toBe(true)
    expect(discordStatus.status).toBe('connected')

    expect(telegramStatus.enabled).toBe(true)
    expect(telegramStatus.status).toBe('connected')

    expect(slackStatus.enabled).toBe(true)
    expect(slackStatus.status).toBe('connected')
  })

  test('disabling one channel does not affect others', async () => {
    await configureDiscord('discord-token')
    await configureTelegram('telegram-token')
    await configureSlack('slack-bot', 'slack-app')

    await disableDiscord()

    const discordStatus = getDiscordStatus()
    const telegramStatus = getTelegramStatus()
    const slackStatus = getSlackStatus()

    expect(discordStatus.enabled).toBe(false)
    expect(telegramStatus.enabled).toBe(true)
    expect(slackStatus.enabled).toBe(true)
  })
})
