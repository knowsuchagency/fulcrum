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
