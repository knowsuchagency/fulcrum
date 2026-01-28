/**
 * Message Handler - Routes incoming messages from channels to the AI assistant.
 * Handles special commands (/reset, /help, /status) and response splitting.
 */

import { log } from '../../lib/logger'
import { activeChannels, setMessageHandler } from './channel-manager'
import { getOrCreateSession, resetSession } from './session-mapper'
import { getMessagingSystemPrompt, type MessagingContext } from './system-prompts'
import * as assistantService from '../assistant-service'
import type { IncomingMessage } from './types'

// Special commands that don't go to the AI
const COMMANDS = {
  RESET: ['/reset', '/new', '/clear'],
  HELP: ['/help', '/?'],
  STATUS: ['/status', '/info'], // /info for Slack (where /status is reserved)
}

/**
 * Handle incoming message from any channel.
 * Routes to AI assistant and sends response back.
 */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const content = msg.content.trim()

  // Check for special commands
  if (COMMANDS.RESET.some((cmd) => content.toLowerCase() === cmd)) {
    // For email, reset doesn't make sense - each thread is its own session
    if (msg.channelType === 'email') {
      await sendResponse(msg, 'To start a new conversation, simply send a new email (not a reply). Each email thread has its own conversation history.')
      return
    }
    await handleResetCommand(msg)
    return
  }

  if (COMMANDS.HELP.some((cmd) => content.toLowerCase() === cmd)) {
    await handleHelpCommand(msg)
    return
  }

  if (COMMANDS.STATUS.some((cmd) => content.toLowerCase() === cmd)) {
    await handleStatusCommand(msg)
    return
  }

  // Route to AI assistant
  // For email, use threadId as session key (each email thread = separate conversation)
  // For other channels, use senderId (each user = separate conversation)
  const emailThreadId = msg.channelType === 'email' ? (msg.metadata?.threadId as string) : undefined
  const { session } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName,
    emailThreadId
  )

  log.messaging.info('Routing message to assistant', {
    connectionId: msg.connectionId,
    senderId: msg.senderId,
    sessionId: session.id,
    channelType: msg.channelType,
  })

  try {
    // Build context for intelligent message handling
    // The assistant decides whether to respond, create events, or ignore
    const context: MessagingContext = {
      channel: msg.channelType,
      sender: msg.senderId,
      senderName: msg.senderName,
      content,
      metadata: {
        subject: msg.metadata?.subject as string | undefined,
        threadId: msg.metadata?.threadId as string | undefined,
        messageId: msg.metadata?.messageId as string | undefined,
      },
    }
    const systemPrompt = getMessagingSystemPrompt(msg.channelType, context)

    // Stream the response - assistant handles everything via MCP tools
    const stream = assistantService.streamMessage(session.id, content, {
      systemPromptOverride: systemPrompt,
    })

    // Consume stream - responses are sent via the message MCP tool
    for await (const event of stream) {
      if (event.type === 'error') {
        const errorMsg = (event.data as { message: string }).message
        log.messaging.error('Assistant error handling message', { error: errorMsg })
      }
    }
  } catch (err) {
    log.messaging.error('Error processing message through assistant', {
      connectionId: msg.connectionId,
      sessionId: session.id,
      error: String(err),
    })
  }
}

/**
 * Handle /reset command - start fresh conversation.
 */
async function handleResetCommand(msg: IncomingMessage): Promise<void> {
  resetSession(msg.connectionId, msg.senderId, msg.senderName)

  // Use Block Kit for Slack
  if (msg.channelType === 'slack') {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✓ *Conversation reset!* I\'ve started a fresh session. How can I help you?',
        },
      },
    ]
    await sendResponse(msg, 'Conversation reset!', { blocks })
    return
  }

  await sendResponse(
    msg,
    "Conversation reset! I've started a fresh session. How can I help you?"
  )
}

/**
 * Handle /help command.
 */
async function handleHelpCommand(msg: IncomingMessage): Promise<void> {
  const isEmail = msg.channelType === 'email'

  // Use Block Kit for Slack
  if (msg.channelType === 'slack') {
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'AI Assistant Help', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Available Commands:*' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '• `/reset` - Start a fresh conversation\n' +
            '• `/help` - Show this help message\n' +
            '• `/info` - Show your session status',
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Just message me to chat! I\'m powered by Claude.',
          },
        ],
      },
    ]
    await sendResponse(msg, 'AI Assistant Help', { blocks })
    return
  }

  const helpText = isEmail
    ? `*Fulcrum AI Assistant*

I'm Claude, ready to help you with questions and tasks.

*Available commands:*
/help - Show this help message
/status - Show session info

*Email threading:*
Each email thread has its own conversation history. To start a fresh conversation, send a new email (not a reply).

Just send any message and I'll do my best to help!`
    : `*Fulcrum AI Assistant*

I'm Claude, ready to help you with questions and tasks.

*Available commands:*
/reset - Start a fresh conversation
/help - Show this help message
/status - Show session info

Just send any message and I'll do my best to help!`

  await sendResponse(msg, helpText)
}

/**
 * Handle /status command.
 */
async function handleStatusCommand(msg: IncomingMessage): Promise<void> {
  const emailThreadId = msg.channelType === 'email' ? (msg.metadata?.threadId as string) : undefined
  const { session, mapping } = getOrCreateSession(
    msg.connectionId,
    msg.senderId,
    msg.senderName,
    emailThreadId
  )

  // Use Block Kit for Slack
  if (msg.channelType === 'slack') {
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Session Status', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Session ID:*\n\`${session.id.slice(0, 8)}...\`` },
          { type: 'mrkdwn', text: `*Messages:*\n${session.messageCount ?? 0}` },
          { type: 'mrkdwn', text: `*Started:*\n${new Date(mapping.createdAt).toLocaleString()}` },
          { type: 'mrkdwn', text: `*Last Active:*\n${new Date(mapping.lastMessageAt).toLocaleString()}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Use `/reset` to start a fresh conversation.' },
        ],
      },
    ]
    await sendResponse(msg, 'Session Status', { blocks })
    return
  }

  const statusText = `*Session Status*

Session ID: ${session.id.slice(0, 8)}...
Messages: ${session.messageCount ?? 0}
Started: ${new Date(mapping.createdAt).toLocaleString()}
Last active: ${new Date(mapping.lastMessageAt).toLocaleString()}`

  await sendResponse(msg, statusText)
}

/**
 * Send a response back through the appropriate channel.
 */
async function sendResponse(
  originalMsg: IncomingMessage,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const channel = activeChannels.get(originalMsg.connectionId)
  if (!channel) {
    log.messaging.warn('No active channel to send response', {
      connectionId: originalMsg.connectionId,
    })
    return
  }

  // WhatsApp has a message size limit, split if needed
  const maxLength = 4000
  const parts = splitMessage(content, maxLength)

  // Merge provided metadata with original message metadata
  const combinedMetadata = { ...originalMsg.metadata, ...metadata }

  for (const part of parts) {
    // Pass metadata for email threading and Slack blocks
    await channel.sendMessage(originalMsg.senderId, part, combinedMetadata)
    // Small delay between parts to maintain order
    if (parts.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

/**
 * Split a message into parts that fit within a size limit.
 */
function splitMessage(content: string, maxLength: number): string[] {
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

// Register message handler with channel manager
setMessageHandler(handleIncomingMessage)
