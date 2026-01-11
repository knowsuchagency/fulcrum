import type { Terminal as XTerm } from '@xterm/xterm'

/**
 * Register a custom OSC 52 (clipboard) handler that prevents xterm.js from
 * sending clipboard responses back through the input stream.
 *
 * ## Problem
 * When terminal apps like OpenCode query the clipboard via OSC 52, xterm.js
 * automatically responds by calling terminal.input() with the clipboard data.
 * This triggers the onData event, which sends the response to the server as
 * if it were user input. The clipboard data (which can contain any bytes)
 * interleaves with actual keyboard input, causing corruption (e.g., Ctrl+P
 * appearing as literal "^P" characters).
 *
 * ## Solution
 * Register a custom OSC 52 handler that:
 * 1. Intercepts all OSC 52 sequences before xterm.js default handler
 * 2. Allows clipboard WRITES (so apps can set clipboard via OSC 52)
 * 3. Blocks clipboard READS by returning true (marking as "handled")
 *
 * This preserves:
 * - Browser copy/paste (Cmd/Ctrl+C/V) - uses browser clipboard API
 * - Select-to-copy functionality - uses browser selection API
 * - xterm.js selection API - works independently of OSC 52
 *
 * @param term The xterm.js Terminal instance
 * @returns A cleanup function to unregister the handler
 */
export function registerOsc52Handler(term: XTerm): () => void {
  // OSC 52 format: ESC ] 52 ; <selection> ; <data> ST
  // - selection: c (clipboard), p (primary), etc.
  // - data: base64 encoded clipboard content, or "?" to query
  //
  // When data is "?", it's a READ request - we want to block these.
  // When data is base64, it's a WRITE request - we allow these through.
  const handler = term.parser.registerOscHandler(52, (data: string) => {
    // OSC 52 data format: "<selection>;<base64-data>" or "<selection>;?" for query
    const semicolonIndex = data.indexOf(';')
    if (semicolonIndex === -1) {
      // Malformed OSC 52, let xterm handle it (or ignore)
      return false
    }

    const payload = data.slice(semicolonIndex + 1)

    // If payload is "?" (query) or empty, this is a READ request
    // Block it by returning true (we "handled" it by doing nothing)
    if (payload === '?' || payload === '') {
      // Silently swallow clipboard read requests
      // This prevents xterm.js from sending clipboard content back via onData
      return true
    }

    // For WRITE requests (base64 data), write to browser clipboard
    // This allows apps to set clipboard content via OSC 52
    try {
      const decoded = atob(payload)
      navigator.clipboard.writeText(decoded).catch(() => {
        // Clipboard write failed (e.g., permissions), silently ignore
      })
    } catch {
      // Invalid base64, ignore
    }

    // Return true to prevent xterm.js default handler from running
    // (which would also try to write to clipboard and potentially respond)
    return true
  })

  return () => {
    handler.dispose()
  }
}
