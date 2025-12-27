/**
 * Sync utilities for optimistic updates with rollback support.
 *
 * This module provides:
 * - Request ID generation for correlating client requests with server responses
 * - Pending update tracking with inverse patches for rollback
 * - Type definitions for sync messages
 */
import type { IJsonPatch } from 'mobx-state-tree'

/**
 * Generate a unique request ID for correlating requests with responses.
 * Uses crypto.randomUUID() when available, falls back to timestamp-based ID.
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Generate a temporary client-side ID for optimistic entity creation.
 * Prefixed with 'temp-' to distinguish from server-assigned IDs.
 */
export function generateTempId(): string {
  return `temp-${generateRequestId()}`
}

/**
 * Pending update tracking for optimistic updates.
 * Stores inverse patches that can be applied to rollback changes.
 */
export interface PendingUpdate {
  /** Entity type (terminal or tab) */
  entityType: 'terminal' | 'tab'
  /** Temporary client-side entity ID */
  tempId: string
  /** Inverse patches to apply for rollback */
  inversePatches: IJsonPatch[]
  /** Timestamp when the update was initiated */
  createdAt: number
}

/**
 * Apply patches in reverse order for rollback.
 * MST's applyPatch function handles individual patches,
 * but for rollback we need to apply inverse patches in reverse order.
 */
export function applyInversePatches(
  applyPatch: (patch: IJsonPatch) => void,
  inversePatches: IJsonPatch[]
): void {
  // Apply in reverse order to properly undo changes
  for (let i = inversePatches.length - 1; i >= 0; i--) {
    applyPatch(inversePatches[i])
  }
}

/**
 * Sync message types for server responses.
 */
export interface SyncConfirmPayload {
  requestId: string
  entityType: 'terminal' | 'tab'
  tempId: string
  realId: string
}

export interface SyncRejectPayload {
  requestId: string
  error: string
  entityType?: 'terminal' | 'tab'
  tempId?: string
}
