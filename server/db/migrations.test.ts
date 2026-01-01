import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const projectRoot = dirname(dirname(import.meta.dir))
const journalPath = join(projectRoot, 'drizzle', 'meta', '_journal.json')

interface JournalEntry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

interface Journal {
  version: string
  dialect: string
  entries: JournalEntry[]
}

describe('migrations', () => {
  it('should have monotonically increasing timestamps', () => {
    const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf-8'))

    let previousWhen = 0
    const outOfOrder: string[] = []

    for (const entry of journal.entries) {
      if (entry.when <= previousWhen) {
        outOfOrder.push(
          `${entry.tag}: timestamp ${entry.when} is not greater than previous ${previousWhen}`
        )
      }
      previousWhen = entry.when
    }

    expect(outOfOrder).toEqual([])
  })

  it('should have sequential idx values starting from 0', () => {
    const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf-8'))

    for (let i = 0; i < journal.entries.length; i++) {
      expect(journal.entries[i].idx).toBe(i)
    }
  })

  it('should have tags matching their idx prefix', () => {
    const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf-8'))

    for (const entry of journal.entries) {
      const prefix = entry.tag.split('_')[0]
      const expectedPrefix = String(entry.idx).padStart(4, '0')
      expect(prefix).toBe(expectedPrefix)
    }
  })
})
