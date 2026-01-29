/**
 * Email channel types and constants.
 */

/**
 * Parsed email headers for authorization and threading
 */
export interface EmailHeaders {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  from: string | null
  fromName: string | null
  to: string[]
  cc: string[]
  subject: string | null
  date: Date | null
  // Headers for automated email detection (RFC 3834 compliance)
  autoSubmitted: string | null // RFC 3834: "no", "auto-generated", "auto-replied", etc.
  precedence: string | null // "bulk", "junk", "list"
  listUnsubscribe: string | null // Presence indicates mailing list/newsletter
  xAutoResponseSuppress: string | null // Microsoft header for auto-responder awareness
  returnPath: string | null // Empty "<>" indicates bounce/delivery notification
}

/**
 * Email signature patterns to strip from incoming emails.
 */
export const SIGNATURE_PATTERNS = [
  /^--\s*$/m, // Standard signature delimiter
  /^_{3,}$/m, // Line of underscores
  /^Sent from my (iPhone|iPad|Android|Galaxy|Pixel)/im,
  /^Get Outlook for/im,
  /^Sent via /im,
]

/**
 * Quoted reply patterns to strip.
 */
export const QUOTED_REPLY_PATTERNS = [
  /^On .+, .+ wrote:$/m, // "On Jan 1, 2024, John wrote:"
  /^>+\s?.*/gm, // Lines starting with >
  /^From: .+$/m, // "From: sender@example.com"
  /^Sent: .+$/m, // "Sent: January 1, 2024"
  /^To: .+$/m, // "To: recipient@example.com"
  /^Subject: .+$/m, // "Subject: Re: ..."
]

/**
 * Sender address patterns that indicate automated emails.
 * These should not receive auto-responses per RFC 3834.
 */
export const AUTOMATED_SENDER_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^do-not-reply@/i,
  /^donotreply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounces?@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^daemon@/i,
  /^auto@/i,
  /^automated@/i,
  /^system@/i,
  /^info@.*\.noreply\./i, // e.g., info@mail.noreply.github.com
]

/**
 * Precedence header values that indicate automated/bulk mail.
 */
export const AUTOMATED_PRECEDENCE_VALUES = ['bulk', 'junk', 'list', 'auto_reply']

/**
 * Result of automated email detection.
 */
export interface AutomatedEmailResult {
  isAutomated: boolean
  reason?: string
}

/**
 * Detect if an email is automated and should not receive an auto-response.
 * Based on RFC 3834 recommendations for auto-responder best practices.
 *
 * Detection criteria:
 * 1. Auto-Submitted header (RFC 3834): Values other than "no" indicate automated
 * 2. Precedence header: "bulk", "junk", "list" values indicate mass mail
 * 3. List-Unsubscribe header: Presence indicates mailing list/newsletter
 * 4. X-Auto-Response-Suppress header: Microsoft header for auto-responder awareness
 * 5. Return-Path header: Empty "<>" indicates bounce/delivery notification
 * 6. Sender patterns: noreply@, mailer-daemon@, notifications@, etc.
 */
export function isAutomatedEmail(headers: EmailHeaders): AutomatedEmailResult {
  // 1. Check Auto-Submitted header (RFC 3834)
  // Any value other than "no" indicates an automated message
  if (headers.autoSubmitted && headers.autoSubmitted.toLowerCase() !== 'no') {
    return {
      isAutomated: true,
      reason: `Auto-Submitted header: ${headers.autoSubmitted}`,
    }
  }

  // 2. Check Precedence header for bulk/automated mail indicators
  if (headers.precedence) {
    const precedenceLower = headers.precedence.toLowerCase()
    if (AUTOMATED_PRECEDENCE_VALUES.includes(precedenceLower)) {
      return {
        isAutomated: true,
        reason: `Precedence header: ${headers.precedence}`,
      }
    }
  }

  // 3. Check List-Unsubscribe header (indicates mailing list/newsletter)
  if (headers.listUnsubscribe) {
    return {
      isAutomated: true,
      reason: 'List-Unsubscribe header present',
    }
  }

  // 4. Check X-Auto-Response-Suppress header (Microsoft)
  // Any value indicates the sender doesn't want auto-responses
  if (headers.xAutoResponseSuppress) {
    return {
      isAutomated: true,
      reason: `X-Auto-Response-Suppress header: ${headers.xAutoResponseSuppress}`,
    }
  }

  // 5. Check Return-Path for empty value (bounce/delivery notification)
  // Empty Return-Path is represented as "<>" or empty string
  if (headers.returnPath !== null) {
    const returnPathTrimmed = headers.returnPath.trim()
    if (returnPathTrimmed === '<>' || returnPathTrimmed === '') {
      return {
        isAutomated: true,
        reason: 'Empty Return-Path (bounce/delivery notification)',
      }
    }
  }

  // 6. Check sender address patterns
  if (headers.from) {
    for (const pattern of AUTOMATED_SENDER_PATTERNS) {
      if (pattern.test(headers.from)) {
        return {
          isAutomated: true,
          reason: `Sender matches automated pattern: ${headers.from}`,
        }
      }
    }
  }

  return { isAutomated: false }
}
