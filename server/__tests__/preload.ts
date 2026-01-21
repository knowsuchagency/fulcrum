/**
 * Test preload script - runs before any test code.
 *
 * This enables test mode which prevents tests from accidentally
 * accessing production paths (~/.fulcrum, ~/.claude, ~/.claude.json).
 *
 * If test code attempts to access production paths, it will throw
 * a TEST ISOLATION VIOLATION error instead of silently corrupting
 * production settings.
 */
import { enableTestMode } from '../lib/settings'

enableTestMode()
