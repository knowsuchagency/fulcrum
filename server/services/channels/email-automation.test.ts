/**
 * Tests for automated email detection.
 * Ensures we don't send auto-responses to automated emails per RFC 3834.
 */

import { describe, expect, test } from 'bun:test'
import { isAutomatedEmail, type EmailHeaders } from './email-types'

/**
 * Create a minimal EmailHeaders object for testing.
 */
function createHeaders(overrides: Partial<EmailHeaders> = {}): EmailHeaders {
  return {
    messageId: '<test@example.com>',
    inReplyTo: null,
    references: [],
    from: 'sender@example.com',
    fromName: 'Test Sender',
    to: ['recipient@example.com'],
    cc: [],
    subject: 'Test Subject',
    date: new Date(),
    autoSubmitted: null,
    precedence: null,
    listUnsubscribe: null,
    xAutoResponseSuppress: null,
    returnPath: null,
    ...overrides,
  }
}

describe('isAutomatedEmail', () => {
  describe('Auto-Submitted header (RFC 3834)', () => {
    test('detects auto-generated emails', () => {
      const headers = createHeaders({ autoSubmitted: 'auto-generated' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('Auto-Submitted')
    })

    test('detects auto-replied emails', () => {
      const headers = createHeaders({ autoSubmitted: 'auto-replied' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects auto-notified emails', () => {
      const headers = createHeaders({ autoSubmitted: 'auto-notified' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('allows emails with Auto-Submitted: no', () => {
      const headers = createHeaders({ autoSubmitted: 'no' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('is case-insensitive for Auto-Submitted: no', () => {
      const headers = createHeaders({ autoSubmitted: 'NO' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })
  })

  describe('Precedence header', () => {
    test('detects bulk emails', () => {
      const headers = createHeaders({ precedence: 'bulk' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('Precedence')
    })

    test('detects junk emails', () => {
      const headers = createHeaders({ precedence: 'junk' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects list emails', () => {
      const headers = createHeaders({ precedence: 'list' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects auto_reply emails', () => {
      const headers = createHeaders({ precedence: 'auto_reply' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('is case-insensitive', () => {
      const headers = createHeaders({ precedence: 'BULK' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('allows normal precedence values', () => {
      const headers = createHeaders({ precedence: 'normal' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })
  })

  describe('List-Unsubscribe header', () => {
    test('detects mailing list emails', () => {
      const headers = createHeaders({ listUnsubscribe: '<mailto:unsubscribe@example.com>' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('List-Unsubscribe')
    })

    test('detects emails with URL unsubscribe', () => {
      const headers = createHeaders({ listUnsubscribe: '<https://example.com/unsubscribe>' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })
  })

  describe('X-Auto-Response-Suppress header (Microsoft)', () => {
    test('detects OOF (Out of Office) suppression', () => {
      const headers = createHeaders({ xAutoResponseSuppress: 'OOF' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('X-Auto-Response-Suppress')
    })

    test('detects AutoReply suppression', () => {
      const headers = createHeaders({ xAutoResponseSuppress: 'AutoReply' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects All suppression', () => {
      const headers = createHeaders({ xAutoResponseSuppress: 'All' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects DR (Delivery Receipt) suppression', () => {
      const headers = createHeaders({ xAutoResponseSuppress: 'DR, RN' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })
  })

  describe('Return-Path header (bounce detection)', () => {
    test('detects empty Return-Path (bounce)', () => {
      const headers = createHeaders({ returnPath: '<>' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('Return-Path')
    })

    test('detects empty string Return-Path', () => {
      const headers = createHeaders({ returnPath: '' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects whitespace-only Return-Path', () => {
      const headers = createHeaders({ returnPath: '  ' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('allows normal Return-Path', () => {
      const headers = createHeaders({ returnPath: '<sender@example.com>' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('allows null Return-Path (not present in email)', () => {
      const headers = createHeaders({ returnPath: null })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })
  })

  describe('Sender address patterns', () => {
    test('detects noreply@ addresses', () => {
      const headers = createHeaders({ from: 'noreply@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('automated pattern')
    })

    test('detects no-reply@ addresses', () => {
      const headers = createHeaders({ from: 'no-reply@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects do-not-reply@ addresses', () => {
      const headers = createHeaders({ from: 'do-not-reply@company.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects donotreply@ addresses', () => {
      const headers = createHeaders({ from: 'donotreply@service.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects mailer-daemon@ addresses', () => {
      const headers = createHeaders({ from: 'mailer-daemon@mail.example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects postmaster@ addresses', () => {
      const headers = createHeaders({ from: 'postmaster@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects bounce@ addresses', () => {
      const headers = createHeaders({ from: 'bounce@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects bounces@ addresses', () => {
      const headers = createHeaders({ from: 'bounces@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects notification@ addresses', () => {
      const headers = createHeaders({ from: 'notification@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects notifications@ addresses', () => {
      const headers = createHeaders({ from: 'notifications@github.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects alert@ addresses', () => {
      const headers = createHeaders({ from: 'alert@monitoring.example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects alerts@ addresses', () => {
      const headers = createHeaders({ from: 'alerts@datadog.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects daemon@ addresses', () => {
      const headers = createHeaders({ from: 'daemon@server.example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects auto@ addresses', () => {
      const headers = createHeaders({ from: 'auto@service.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects automated@ addresses', () => {
      const headers = createHeaders({ from: 'automated@company.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects system@ addresses', () => {
      const headers = createHeaders({ from: 'system@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('is case-insensitive', () => {
      const headers = createHeaders({ from: 'NoReply@Example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('allows normal email addresses', () => {
      const headers = createHeaders({ from: 'john.doe@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('does not match noreply in the middle of address', () => {
      const headers = createHeaders({ from: 'user-noreply@example.com' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })
  })

  describe('Real-world examples', () => {
    test('detects Meetup notifications', () => {
      const headers = createHeaders({
        from: 'noreply@meetup.com',
        precedence: 'bulk',
        listUnsubscribe: '<https://www.meetup.com/unsubscribe>',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects GitHub notifications', () => {
      const headers = createHeaders({
        from: 'notifications@github.com',
        listUnsubscribe: '<https://github.com/notifications/unsubscribe/ABC123>',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects AWS SES bounce notifications', () => {
      const headers = createHeaders({
        from: 'no-reply@bounces.amazonses.com',
        autoSubmitted: 'auto-generated',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects JIRA notifications', () => {
      const headers = createHeaders({
        from: 'jira@company.atlassian.net',
        autoSubmitted: 'auto-generated',
        precedence: 'bulk',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects Mailchimp newsletters', () => {
      const headers = createHeaders({
        from: 'newsletter@mail.company.com',
        precedence: 'bulk',
        listUnsubscribe: '<https://mailchi.mp/unsubscribe>',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects Office 365 auto-replies', () => {
      const headers = createHeaders({
        from: 'colleague@company.com',
        autoSubmitted: 'auto-replied',
        xAutoResponseSuppress: 'OOF, DR, RN, NRN',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('detects bounce messages', () => {
      const headers = createHeaders({
        from: 'mailer-daemon@mail.example.com',
        returnPath: '<>',
        autoSubmitted: 'auto-replied',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
    })

    test('allows normal human emails', () => {
      const headers = createHeaders({
        from: 'john.smith@gmail.com',
        subject: 'Hello!',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('allows normal corporate emails', () => {
      const headers = createHeaders({
        from: 'ceo@bigcorp.com',
        subject: 'Q4 Planning',
        autoSubmitted: 'no', // Explicitly marked as human-sent
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('allows emails from info@ (common business address)', () => {
      const headers = createHeaders({
        from: 'info@smallbusiness.com',
        subject: 'Your inquiry',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('allows emails from support@ (often human-staffed)', () => {
      const headers = createHeaders({
        from: 'support@company.com',
        subject: 'Re: Your ticket #12345',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })
  })

  describe('Edge cases', () => {
    test('handles null from address', () => {
      const headers = createHeaders({ from: null })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('handles empty from address', () => {
      const headers = createHeaders({ from: '' })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(false)
    })

    test('priority order: Auto-Submitted checked first', () => {
      const headers = createHeaders({
        autoSubmitted: 'auto-generated',
        precedence: 'bulk',
        from: 'noreply@example.com',
      })
      const result = isAutomatedEmail(headers)
      expect(result.isAutomated).toBe(true)
      expect(result.reason).toContain('Auto-Submitted')
    })
  })
})
