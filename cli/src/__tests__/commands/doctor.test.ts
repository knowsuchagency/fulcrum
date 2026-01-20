import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { handleDoctorCommand } from '../../commands/doctor'

describe('doctor command', () => {
  let logs: string[] = []
  const originalLog = console.log

  beforeEach(() => {
    logs = []
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalLog
  })

  describe('output format', () => {
    test('outputs human-readable format by default', async () => {
      await handleDoctorCommand({})

      expect(logs.some((l) => l.includes('Fulcrum Doctor'))).toBe(true)
      expect(logs.some((l) => l.includes('Required:'))).toBe(true)
      expect(logs.some((l) => l.includes('Optional:'))).toBe(true)
      expect(logs.some((l) => l.includes('Status:'))).toBe(true)
    })

    test('outputs JSON format with --json flag', async () => {
      await handleDoctorCommand({ json: 'true' })

      // With --json, output goes through the output() function which logs JSON
      // The output format is { success: true, data: [...] }
      const jsonOutput = logs.find((l) => l.startsWith('{'))
      expect(jsonOutput).toBeDefined()
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput)
        expect(parsed.success).toBe(true)
        expect(Array.isArray(parsed.data)).toBe(true)
        expect(parsed.data[0]).toHaveProperty('name')
        expect(parsed.data[0]).toHaveProperty('installed')
      }
    })

    test('lists expected dependencies', async () => {
      await handleDoctorCommand({})

      const output = logs.join('\n')
      // Check for some expected dependencies
      expect(output).toContain('bun')
      expect(output).toContain('dtach')
    })
  })
})
