/**
 * Simple fuzzy search scoring
 * Returns a score > 0 if the query matches, 0 otherwise
 * Higher score = better match
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

  // Fuzzy character match
  let textIndex = 0
  let queryIndex = 0
  let score = 0

  while (textIndex < lowerText.length && queryIndex < lowerQuery.length) {
    if (lowerText[textIndex] === lowerQuery[queryIndex]) {
      score += 1
      queryIndex++
    }
    textIndex++
  }

  // Only count as a match if all query characters were found
  if (queryIndex === lowerQuery.length) {
    return score
  }

  return 0
}
