/**
 * Email API - Functions for managing Email channel configuration and state.
 * Configuration stored in settings.json under channels.email.
 * Includes email search and storage functions.
 */

import { getSettings, updateSettingByPath } from '../../../lib/settings'
import { testEmailCredentials as testEmailCreds } from '../email-channel'
import {
  activeChannels,
  getActiveEmailChannel,
  EMAIL_CONNECTION_ID,
  startEmailChannel,
  stopEmailChannel,
} from '../channel-manager'
import type { ConnectionStatus, EmailAuthState } from '../types'

// Re-export connection ID for backward compatibility
export { EMAIL_CONNECTION_ID } from '../channel-manager'

/**
 * Configure email with credentials and enable the channel.
 * Saves configuration to settings.json and starts the channel.
 */
export async function configureEmail(credentials: EmailAuthState): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  const MASKED = '••••••••'

  // Stop existing channel if running
  await stopEmailChannel()

  // Get existing settings to preserve masked passwords
  const settings = getSettings()
  const stored = settings.channels.email

  // Determine final passwords (use stored if masked)
  const smtpPassword = credentials.smtp.password === MASKED ? stored.smtp.password : credentials.smtp.password
  const imapPassword = credentials.imap.password === MASKED ? stored.imap.password : credentials.imap.password

  // Save credentials to settings
  updateSettingByPath('channels.email.enabled', true)
  updateSettingByPath('channels.email.smtp.host', credentials.smtp.host)
  updateSettingByPath('channels.email.smtp.port', credentials.smtp.port)
  updateSettingByPath('channels.email.smtp.secure', credentials.smtp.secure)
  updateSettingByPath('channels.email.smtp.user', credentials.smtp.user)
  updateSettingByPath('channels.email.smtp.password', smtpPassword)
  updateSettingByPath('channels.email.imap.host', credentials.imap.host)
  updateSettingByPath('channels.email.imap.port', credentials.imap.port)
  updateSettingByPath('channels.email.imap.secure', credentials.imap.secure)
  updateSettingByPath('channels.email.imap.user', credentials.imap.user)
  updateSettingByPath('channels.email.imap.password', imapPassword)
  updateSettingByPath('channels.email.pollIntervalSeconds', credentials.pollIntervalSeconds)
  updateSettingByPath('channels.email.sendAs', credentials.sendAs || null)
  updateSettingByPath('channels.email.allowedSenders', credentials.allowedSenders || [])
  updateSettingByPath('channels.email.bcc', credentials.bcc || null)

  // Start the channel
  await startEmailChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(EMAIL_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Test email credentials without saving them.
 * If passwords are masked (••••••••), uses stored credentials instead.
 */
export async function testEmailCredentials(credentials: EmailAuthState): Promise<{
  success: boolean
  smtpOk: boolean
  imapOk: boolean
  error?: string
}> {
  const MASKED = '••••••••'

  // If passwords are masked, substitute with stored credentials
  let finalCreds = credentials
  if (credentials.smtp.password === MASKED || credentials.imap.password === MASKED) {
    const settings = getSettings()
    const stored = settings.channels.email

    if (!stored.smtp.password || !stored.imap.password) {
      return {
        success: false,
        smtpOk: false,
        imapOk: false,
        error: 'No stored credentials found. Please enter passwords.',
      }
    }

    finalCreds = {
      ...credentials,
      smtp: {
        ...credentials.smtp,
        password: credentials.smtp.password === MASKED ? stored.smtp.password : credentials.smtp.password,
      },
      imap: {
        ...credentials.imap,
        password: credentials.imap.password === MASKED ? stored.imap.password : credentials.imap.password,
      },
    }
  }

  return testEmailCreds(finalCreds)
}

/**
 * Enable email using existing credentials from settings.
 * Returns an error if credentials are not configured.
 */
export async function enableEmail(): Promise<{
  enabled: boolean
  status: ConnectionStatus
  error?: string
}> {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  // Check if we have valid credentials
  if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password ||
      !emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
    return {
      enabled: false,
      status: 'credentials_required',
      error: 'Email credentials not configured. Please configure SMTP and IMAP settings first.',
    }
  }

  // Stop existing channel if running
  await stopEmailChannel()

  // Update settings to enable
  updateSettingByPath('channels.email.enabled', true)

  // Start the channel
  await startEmailChannel()

  // Get the active channel reference after starting
  const channel = activeChannels.get(EMAIL_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'connecting',
  }
}

/**
 * Disable email and stop the channel.
 */
export async function disableEmail(): Promise<{
  enabled: boolean
  status: ConnectionStatus
}> {
  await stopEmailChannel()

  // Update settings to disable
  updateSettingByPath('channels.email.enabled', false)

  return {
    enabled: false,
    status: 'disconnected',
  }
}

/**
 * Get email connection status.
 */
export function getEmailStatus(): {
  enabled: boolean
  status: ConnectionStatus
} {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  if (!emailConfig.enabled) {
    return { enabled: false, status: 'disconnected' }
  }

  // Check if we have valid credentials
  if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.password ||
      !emailConfig.imap.host || !emailConfig.imap.user || !emailConfig.imap.password) {
    return { enabled: true, status: 'credentials_required' }
  }

  const channel = activeChannels.get(EMAIL_CONNECTION_ID)

  return {
    enabled: true,
    status: channel?.getStatus() || 'disconnected',
  }
}

/**
 * Get email configuration (passwords masked with ********).
 */
export function getEmailConfig(): {
  smtp: { host: string; port: number; secure: boolean; user: string; password: string } | null
  imap: { host: string; port: number; secure: boolean; user: string; password: string } | null
  pollIntervalSeconds: number
  sendAs: string | null
  allowedSenders: string[]
  bcc: string | null
} | null {
  const settings = getSettings()
  const emailConfig = settings.channels.email

  if (!emailConfig.smtp.host && !emailConfig.imap.host) {
    return null
  }

  return {
    smtp: emailConfig.smtp.host ? {
      host: emailConfig.smtp.host,
      port: emailConfig.smtp.port,
      secure: emailConfig.smtp.secure,
      user: emailConfig.smtp.user,
      password: emailConfig.smtp.password ? '••••••••' : '',
    } : null,
    imap: emailConfig.imap.host ? {
      host: emailConfig.imap.host,
      port: emailConfig.imap.port,
      secure: emailConfig.imap.secure,
      user: emailConfig.imap.user,
      password: emailConfig.imap.password ? '••••••••' : '',
    } : null,
    pollIntervalSeconds: emailConfig.pollIntervalSeconds,
    sendAs: emailConfig.sendAs,
    allowedSenders: emailConfig.allowedSenders,
    bcc: emailConfig.bcc,
  }
}

// ==========================================================================
// Email Search & Storage API
// ==========================================================================

/**
 * Get stored emails from the local database.
 */
export function getStoredEmails(options?: {
  limit?: number
  offset?: number
  direction?: 'incoming' | 'outgoing'
  threadId?: string
  search?: string
  folder?: string
}) {
  const activeEmailChannel = getActiveEmailChannel()
  if (!activeEmailChannel) {
    return []
  }
  return activeEmailChannel.getStoredEmails(options)
}

/**
 * Search emails via IMAP and return matching UIDs.
 */
export async function searchImapEmails(criteria: {
  subject?: string
  from?: string
  to?: string
  since?: Date
  before?: Date
  text?: string
  seen?: boolean
  flagged?: boolean
}): Promise<number[]> {
  const activeEmailChannel = getActiveEmailChannel()
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured')
  }
  return activeEmailChannel.searchImapEmails(criteria)
}

/**
 * Fetch emails by UID from IMAP and store them locally.
 */
export async function fetchAndStoreEmails(uids: number[], options?: { limit?: number }) {
  const activeEmailChannel = getActiveEmailChannel()
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured')
  }
  return activeEmailChannel.fetchAndStoreEmails(uids, options)
}

/**
 * Send an email message directly.
 * Used by the assistant scheduler for proactive messaging.
 */
export async function sendEmailMessage(
  to: string,
  body: string,
  subject?: string,
  replyToMessageId?: string
): Promise<string | undefined> {
  const activeEmailChannel = getActiveEmailChannel()
  if (!activeEmailChannel) {
    throw new Error('Email channel not configured or not connected')
  }

  const success = await activeEmailChannel.sendMessage(to, body, {
    subject,
    messageId: replyToMessageId,
  })

  if (!success) {
    throw new Error('Failed to send email')
  }

  // Return a placeholder message ID (actual ID is in the sent email)
  return `sent-${Date.now()}`
}
