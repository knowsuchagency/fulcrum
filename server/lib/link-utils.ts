import type { LinkType } from '@shared/types'

/**
 * Detect link type and generate label from URL
 * Used by both task and project links
 */
export function detectLinkType(url: string): { type: LinkType; label: string } {
  const prMatch = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)
  if (prMatch) return { type: 'pr', label: `PR #${prMatch[1]}` }

  const issueMatch = url.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/)
  if (issueMatch) return { type: 'issue', label: `Issue #${issueMatch[1]}` }

  if (url.includes('figma.com')) return { type: 'design', label: 'Figma' }
  if (url.includes('notion.so')) return { type: 'docs', label: 'Notion' }

  try {
    return { type: 'other', label: new URL(url).hostname }
  } catch {
    return { type: 'other', label: 'Link' }
  }
}
