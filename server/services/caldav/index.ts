/**
 * CalDAV Service - barrel exports
 */

export {
  // Lifecycle
  startCaldavSync,
  stopCaldavSync,
  getCaldavStatus,
  // Configuration
  testCaldavConnection,
  configureCaldav,
  configureGoogleOAuth,
  completeGoogleOAuth,
  enableCaldav,
  disableCaldav,
  // Calendars
  listCalendars,
  syncCalendars,
  // Events
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from './caldav-service'
