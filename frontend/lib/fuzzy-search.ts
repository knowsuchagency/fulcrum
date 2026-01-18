/**
 * Simple search scoring for filtering tasks
 * Returns a score > 0 if the query matches, 0 otherwise
 * Higher score = better match
 *
 * Case-insensitive matching: exact, starts-with, or contains.
 * No fuzzy character matching - only substring matches.
 */
export function fuzzyScore(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Exact match
  if (lowerText === lowerQuery) return 100

  // Starts with
  if (lowerText.startsWith(lowerQuery)) return 80

  // Contains
  if (lowerText.includes(lowerQuery)) return 60

  return 0
}
