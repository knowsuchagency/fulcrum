/**
 * CalDAV calendar MCP tools
 */
import { z } from 'zod'
import type { ToolRegistrar } from './types'
import { formatSuccess, handleToolError } from '../utils'

export const registerCaldavTools: ToolRegistrar = (server, client) => {
  // list_calendars
  server.tool(
    'list_calendars',
    'List all CalDAV calendars synced from the configured server.',
    {},
    async () => {
      try {
        const calendars = await client.listCalendars()
        return formatSuccess(calendars)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // sync_calendars
  server.tool(
    'sync_calendars',
    'Trigger a manual sync of all CalDAV calendars and events from the server.',
    {},
    async () => {
      try {
        const result = await client.syncCalendars()
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // list_calendar_events
  server.tool(
    'list_calendar_events',
    'List calendar events with optional filtering by calendar, date range, or limit.',
    {
      calendarId: z.optional(z.string()).describe('Filter by calendar ID'),
      from: z.optional(z.string()).describe('Start date filter (ISO format or iCal date)'),
      to: z.optional(z.string()).describe('End date filter (ISO format or iCal date)'),
      limit: z.optional(z.number()).describe('Maximum events to return'),
    },
    async ({ calendarId, from, to, limit }) => {
      try {
        const events = await client.listCalendarEvents({ calendarId, from, to, limit })
        return formatSuccess(events)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // get_calendar_event
  server.tool(
    'get_calendar_event',
    'Get details of a specific calendar event by ID.',
    {
      id: z.string().describe('Event ID'),
    },
    async ({ id }) => {
      try {
        const event = await client.getCalendarEvent(id)
        return formatSuccess(event)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // create_calendar_event
  server.tool(
    'create_calendar_event',
    'Create a new calendar event on a CalDAV calendar.',
    {
      calendarId: z.string().describe('Calendar ID to create the event in'),
      summary: z.string().describe('Event title/summary'),
      dtstart: z.string().describe('Start date/time (iCal format: 20250115T090000Z or 20250115 for all-day)'),
      dtend: z.optional(z.string()).describe('End date/time (iCal format)'),
      duration: z.optional(z.string()).describe('Duration (iCal format, e.g., PT1H for 1 hour)'),
      description: z.optional(z.string()).describe('Event description'),
      location: z.optional(z.string()).describe('Event location'),
      allDay: z.optional(z.boolean()).describe('Whether this is an all-day event'),
      recurrenceRule: z.optional(z.string()).describe('Recurrence rule (RRULE format)'),
      status: z.optional(z.string()).describe('Event status (TENTATIVE, CONFIRMED, CANCELLED)'),
    },
    async (input) => {
      try {
        const event = await client.createCalendarEvent(input)
        return formatSuccess(event)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // update_calendar_event
  server.tool(
    'update_calendar_event',
    'Update an existing calendar event.',
    {
      id: z.string().describe('Event ID to update'),
      summary: z.optional(z.string()).describe('New event title/summary'),
      dtstart: z.optional(z.string()).describe('New start date/time'),
      dtend: z.optional(z.string()).describe('New end date/time'),
      duration: z.optional(z.string()).describe('New duration'),
      description: z.optional(z.string()).describe('New description'),
      location: z.optional(z.string()).describe('New location'),
      allDay: z.optional(z.boolean()).describe('Whether this is an all-day event'),
      recurrenceRule: z.optional(z.string()).describe('New recurrence rule'),
      status: z.optional(z.string()).describe('New status'),
    },
    async ({ id, ...updates }) => {
      try {
        const event = await client.updateCalendarEvent(id, updates)
        return formatSuccess(event)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )

  // delete_calendar_event
  server.tool(
    'delete_calendar_event',
    'Delete a calendar event from the CalDAV server.',
    {
      id: z.string().describe('Event ID to delete'),
    },
    async ({ id }) => {
      try {
        const result = await client.deleteCalendarEvent(id)
        return formatSuccess(result)
      } catch (err) {
        return handleToolError(err)
      }
    }
  )
}
