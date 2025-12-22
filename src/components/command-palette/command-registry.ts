import type { ReactNode } from 'react'

export interface Command {
  id: string
  label: string
  shortcut?: string
  keywords?: string[]
  category: 'navigation' | 'actions'
  action: () => void
  icon?: ReactNode
}

/**
 * Simple fuzzy search scoring
 * Returns a score > 0 if the query matches, 0 otherwise
 * Higher score = better match
 */
function fuzzyScore(text: string, query: string): number {
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

/**
 * Search commands by query
 */
export function searchCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) {
    return commands
  }

  const results = commands
    .map((command) => {
      // Score label
      let score = fuzzyScore(command.label, query)

      // Also check keywords
      if (command.keywords) {
        for (const keyword of command.keywords) {
          const keywordScore = fuzzyScore(keyword, query)
          if (keywordScore > score) {
            score = keywordScore
          }
        }
      }

      return { command, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ command }) => command)

  return results
}

/**
 * Group commands by category
 */
export function groupCommandsByCategory(
  commands: Command[]
): Map<Command['category'], Command[]> {
  const groups = new Map<Command['category'], Command[]>()

  for (const command of commands) {
    const existing = groups.get(command.category) || []
    existing.push(command)
    groups.set(command.category, existing)
  }

  return groups
}

/**
 * Category display names
 */
export const categoryLabels: Record<Command['category'], string> = {
  navigation: 'Navigation',
  actions: 'Actions',
}
