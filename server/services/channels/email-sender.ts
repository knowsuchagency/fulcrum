/**
 * Email sending utilities using SMTP.
 */

import type { Transporter } from 'nodemailer'
import { nanoid } from 'nanoid'
import { log } from '../../lib/logger'
import { storeEmail } from './email-storage'
import type { EmailHeaders } from './email-types'

/**
 * Convert markdown-like formatting to HTML.
 */
export function formatAsHtml(content: string): string {
  // Basic markdown to HTML conversion
  const html = content
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;"><p>${html}</p></div>`
}

/**
 * Send an email message and store it locally.
 */
export async function sendEmail(
  transporter: Transporter,
  connectionId: string,
  fromAddress: string,
  recipientId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  try {
    // Convert markdown-like formatting to HTML
    const htmlContent = formatAsHtml(content)

    // Build email headers for proper threading
    const headers: Record<string, string> = {}

    if (metadata?.messageId) {
      headers['In-Reply-To'] = metadata.messageId as string

      // Build References chain
      const refs: string[] = []
      if (metadata.references && Array.isArray(metadata.references)) {
        refs.push(...metadata.references)
      }
      if (metadata.messageId) {
        refs.push(metadata.messageId as string)
      }
      if (refs.length > 0) {
        headers['References'] = refs.join(' ')
      }
    }

    // Use original subject with Re: prefix if replying
    let subject = 'Fulcrum AI Assistant'
    if (metadata?.subject) {
      const originalSubject = metadata.subject as string
      subject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`
    }

    const sentMail = await transporter.sendMail({
      from: fromAddress,
      to: recipientId,
      subject,
      text: content,
      html: htmlContent,
      headers,
    })

    log.messaging.info('Email sent', {
      connectionId,
      to: recipientId,
      contentLength: content.length,
      subject,
    })

    // Store the outgoing email locally
    const outgoingMessageId = sentMail.messageId || `outgoing-${nanoid()}`
    storeEmail({
      connectionId,
      messageId: outgoingMessageId,
      threadId: metadata?.threadId as string,
      inReplyTo: metadata?.messageId as string,
      references: metadata?.references as string[],
      direction: 'outgoing',
      fromAddress,
      toAddresses: [recipientId],
      subject,
      textContent: content,
      htmlContent,
      emailDate: new Date(),
      folder: 'sent',
    })

    return true
  } catch (err) {
    log.messaging.error('Failed to send email', {
      connectionId,
      to: recipientId,
      error: String(err),
    })
    return false
  }
}

/**
 * Send a canned response to unauthorized senders.
 */
export async function sendUnauthorizedResponse(
  transporter: Transporter,
  connectionId: string,
  fromAddress: string,
  headers: EmailHeaders
): Promise<void> {
  if (!headers.from) return

  const response = `Sorry, I'm not able to respond to messages from your email address.

If you believe this is an error, please contact the owner of this email address.`

  try {
    // Build threading headers
    const emailHeaders: Record<string, string> = {}
    if (headers.messageId) {
      emailHeaders['In-Reply-To'] = headers.messageId
      emailHeaders['References'] = headers.messageId
    }

    let subject = 'Unable to Process Your Request'
    if (headers.subject) {
      subject = headers.subject.startsWith('Re:') ? headers.subject : `Re: ${headers.subject}`
    }

    await transporter.sendMail({
      from: fromAddress,
      to: headers.from,
      subject,
      text: response,
      html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;"><p>${response.replace(/\n/g, '<br>')}</p></div>`,
      headers: emailHeaders,
    })

    log.messaging.info('Sent unauthorized response', {
      connectionId,
      to: headers.from,
    })
  } catch (err) {
    log.messaging.error('Failed to send unauthorized response', {
      connectionId,
      to: headers.from,
      error: String(err),
    })
  }
}
