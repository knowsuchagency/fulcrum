/**
 * Email MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerEmailTools: ToolRegistrar = (server, client) => {
  // list_emails
  server.tool(
    'list_emails',
    'List stored emails from the local database. Emails are automatically stored when received or sent through Fulcrum messaging.',
    {
      limit: z.optional(z.number()).describe('Maximum emails to return (default: 50)'),
      offset: z.optional(z.number()).describe('Number of emails to skip for pagination'),
      direction: z.optional(z.enum(['incoming', 'outgoing'])).describe('Filter by email direction'),
      threadId: z.optional(z.string()).describe('Filter by email thread ID'),
      search: z.optional(z.string()).describe('Search in subject, content, or sender'),
      folder: z.optional(z.string()).describe('Filter by folder (inbox, sent, etc.)'),
    },
    async ({ limit, offset, direction, threadId, search, folder }) => {
      try {
        const result = await client.listEmails({ limit, offset, direction, threadId, search, folder })
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_email
  server.tool(
    'get_email',
    'Get a specific email by ID including full content.',
    {
      id: z.string().describe('Email ID'),
    },
    async ({ id }) => {
      try {
        const email = await client.getEmail(id)
        return formatSuccess(email)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // search_emails
  server.tool(
    'search_emails',
    'Search emails via IMAP. Results are fetched from the mail server and stored locally. Use this for searching emails beyond what is already stored.',
    {
      subject: z.optional(z.string()).describe('Search in email subject'),
      from: z.optional(z.string()).describe('Search by sender address'),
      to: z.optional(z.string()).describe('Search by recipient address'),
      since: z.optional(z.string()).describe('Find emails since this date (ISO format)'),
      before: z.optional(z.string()).describe('Find emails before this date (ISO format)'),
      text: z.optional(z.string()).describe('Search in email body text'),
      seen: z.optional(z.boolean()).describe('Filter by read status'),
      flagged: z.optional(z.boolean()).describe('Filter by flagged/starred status'),
      fetchLimit: z
        .optional(z.number())
        .describe('Maximum emails to fetch and store (default: 20, set to 0 to only get UIDs)'),
    },
    async ({ subject, from, to, since, before, text, seen, flagged, fetchLimit }) => {
      try {
        const result = await client.searchEmails({
          subject,
          from,
          to,
          since,
          before,
          text,
          seen,
          flagged,
          fetchLimit,
        })
        return formatSuccess({
          ...result,
          hint:
            result.matchCount > result.fetched
              ? `Found ${result.matchCount} matches, fetched ${result.fetched}. Use fetch_emails with UIDs to get more.`
              : undefined,
        })
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // fetch_emails
  server.tool(
    'fetch_emails',
    'Fetch specific emails by their IMAP UIDs and store them locally. Use search_emails first to get UIDs.',
    {
      uids: z.array(z.number()).describe('IMAP UIDs of emails to fetch'),
      limit: z.optional(z.number()).describe('Maximum emails to fetch (default: 50)'),
    },
    async ({ uids, limit }) => {
      try {
        const result = await client.fetchEmails(uids, limit)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
