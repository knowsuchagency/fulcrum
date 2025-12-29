import type { Context } from 'hono'

/**
 * Standardized API error codes for programmatic handling.
 * These codes allow frontend to handle specific error cases differently.
 */
export const ErrorCode = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_VALUE: 'INVALID_VALUE',

  // Resource errors (404)
  NOT_FOUND: 'NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TERMINAL_NOT_FOUND: 'TERMINAL_NOT_FOUND',
  REPOSITORY_NOT_FOUND: 'REPOSITORY_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',

  // Conflict errors (409)
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',

  // Authorization errors (401, 403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  GIT_ERROR: 'GIT_ERROR',
  FILESYSTEM_ERROR: 'FILESYSTEM_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',

  // Service-specific errors
  DTACH_NOT_INSTALLED: 'DTACH_NOT_INSTALLED',
  WORKTREE_ERROR: 'WORKTREE_ERROR',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Standardized error response format.
 * All API errors should use this format for consistency.
 */
export interface ApiErrorResponse {
  error: string
  code?: ErrorCodeType
  details?: Record<string, unknown>
}

/**
 * Create a standardized error response.
 *
 * @example
 * // Simple error
 * return apiError(c, 'Task not found', 404, ErrorCode.TASK_NOT_FOUND)
 *
 * // Error with details
 * return apiError(c, 'Validation failed', 400, ErrorCode.VALIDATION_ERROR, {
 *   field: 'email',
 *   reason: 'Invalid format'
 * })
 */
export function apiError(
  c: Context,
  message: string,
  status: number,
  code?: ErrorCodeType,
  details?: Record<string, unknown>
) {
  const response: ApiErrorResponse = { error: message }

  if (code) {
    response.code = code
  }

  if (details) {
    response.details = details
  }

  return c.json(response, status as 400 | 401 | 403 | 404 | 409 | 500)
}

/**
 * Helper for 400 Bad Request errors.
 */
export function badRequest(c: Context, message: string, code?: ErrorCodeType, details?: Record<string, unknown>) {
  return apiError(c, message, 400, code ?? ErrorCode.VALIDATION_ERROR, details)
}

/**
 * Helper for 404 Not Found errors.
 */
export function notFound(c: Context, message: string, code?: ErrorCodeType, details?: Record<string, unknown>) {
  return apiError(c, message, 404, code ?? ErrorCode.NOT_FOUND, details)
}

/**
 * Helper for 409 Conflict errors.
 */
export function conflict(c: Context, message: string, code?: ErrorCodeType, details?: Record<string, unknown>) {
  return apiError(c, message, 409, code ?? ErrorCode.ALREADY_EXISTS, details)
}

/**
 * Helper for 500 Internal Server Error.
 * Safely extracts message from Error objects.
 */
export function serverError(
  c: Context,
  err: unknown,
  fallbackMessage: string,
  code?: ErrorCodeType,
  details?: Record<string, unknown>
) {
  const message = err instanceof Error ? err.message : fallbackMessage
  return apiError(c, message, 500, code ?? ErrorCode.INTERNAL_ERROR, details)
}

/**
 * Helper for 403 Access Denied errors.
 */
export function accessDenied(c: Context, message: string, details?: Record<string, unknown>) {
  return apiError(c, message, 403, ErrorCode.ACCESS_DENIED, details)
}

/**
 * Helper for 401 Unauthorized errors.
 */
export function unauthorized(c: Context, message: string, details?: Record<string, unknown>) {
  return apiError(c, message, 401, ErrorCode.UNAUTHORIZED, details)
}
