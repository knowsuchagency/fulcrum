/**
 * Filtering for xterm.js-generated data that must never be forwarded to the PTY.
 *
 * xterm.js answers application queries (mode reports, color/capability queries,
 * device attributes, cursor position, etc.) by emitting the *response* through
 * its `onData` event, exactly as if the user had typed it. Those responses are
 * meant for xterm.js's own internal use and would corrupt terminal apps if sent
 * to the server, so we drop them here.
 *
 * IMPORTANT: every rule must be anchored. `onData` delivers a generated response
 * as a single, complete event, so anchoring (`^...$`) is correct for them. It is
 * also essential: a clipboard paste also arrives as one `onData` event, and an
 * unanchored rule would match (and silently drop) ordinary pasted text that
 * merely *contains* a response-like substring. For example, pasting
 * `echo "$year"` must reach the PTY even though it contains `$y`.
 */

// Using RegExp constructor for ESC-prefixed patterns to avoid eslint
// no-control-regex warnings on the literal control character.
const ESC = '\u001b'

/** Mouse motion (SGR format, button code 35) — pointer moving without a button. */
const MOUSE_MOTION = new RegExp(`^${ESC}\\[<35;\\d+;\\d+[Mm]$`)

/** ALL OSC sequences (responses to color / capability queries), e.g. `ESC]11;rgb:...ST`. */
const OSC_RESPONSE = new RegExp(`^${ESC}\\]`)

/** DCS sequences (ESC P), e.g. other device-control responses. */
const DCS_RESPONSE = new RegExp(`^${ESC}P`)

/**
 * DECRPM / DECRQSS responses. These are CSI sequences terminated by `$y`, e.g.
 * `ESC[?2026;2$y`. xterm.js may batch several in one event, e.g.
 * `ESC[?1016;2$yESC[?2027;0$y`, so we allow one-or-more frames but still anchor
 * the whole string. This is the anchored replacement for the previous,
 * dangerously-unanchored `/\$y/` rule that dropped any pasted text containing
 * `$y`.
 */
const DECRPM_RESPONSE = new RegExp(`^(?:${ESC}\\[[?>]?[\\d;]*\\$y)+$`)

/** CPR (Cursor Position Report) response, e.g. `ESC[12;34R`. */
const CPR_RESPONSE = new RegExp(`^${ESC}\\[\\d+;\\d+R$`)

/** DA (Device Attributes) response, e.g. `ESC[?62;c`. */
const DA_RESPONSE = new RegExp(`^${ESC}\\[[?>\\d;]*c$`)

/**
 * Returns true when `data` is an xterm.js-generated query response that must be
 * filtered out instead of being forwarded to the PTY.
 *
 * Every check is anchored so that real user input — including pasted text that
 * happens to contain a response-like substring — is never dropped.
 */
export function shouldDropTerminalData(data: string): boolean {
  return (
    MOUSE_MOTION.test(data) ||
    OSC_RESPONSE.test(data) ||
    DCS_RESPONSE.test(data) ||
    DECRPM_RESPONSE.test(data) ||
    CPR_RESPONSE.test(data) ||
    DA_RESPONSE.test(data)
  )
}
