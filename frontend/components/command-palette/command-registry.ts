import type { ReactNode } from 'react'
import { fuzzyScore } from '@/lib/fuzzy-search'

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
