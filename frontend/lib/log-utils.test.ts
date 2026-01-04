import { describe, test, expect } from 'bun:test'
import { getLogType, parseLogs, type LogType } from './log-utils'

describe('getLogType', () => {
  describe('error detection', () => {
    test('detects "error" keyword', () => {
      expect(getLogType('Error: Something went wrong')).toBe('error')
      expect(getLogType('error: connection failed')).toBe('error')
    })

    test('detects "exception" keyword', () => {
      expect(getLogType('Exception thrown in main thread')).toBe('error')
    })

    test('detects "failed" keyword', () => {
      expect(getLogType('Build failed with exit code 1')).toBe('error')
    })

    test('detects "fatal" keyword', () => {
      expect(getLogType('FATAL: Out of memory')).toBe('error')
    })

    test('detects "crash" keyword', () => {
      expect(getLogType('Application crash detected')).toBe('error')
    })

    test('detects "uncaught" keyword', () => {
      expect(getLogType('Uncaught TypeError')).toBe('error')
    })

    test('detects "errno" keyword', () => {
      expect(getLogType('ENOENT: no such file (errno -2)')).toBe('error')
    })

    test('detects "reject" keyword', () => {
      expect(getLogType('Unhandled promise rejection')).toBe('error')
    })
  })

  describe('warning detection', () => {
    test('detects "warning" keyword', () => {
      expect(getLogType('Warning: Deprecated API used')).toBe('warning')
    })

    test('detects "deprecated" keyword', () => {
      expect(getLogType('This function is deprecated')).toBe('warning')
    })

    test('detects "caution" keyword', () => {
      expect(getLogType('Caution: This action cannot be undone')).toBe('warning')
    })

    test('detects "unstable" keyword', () => {
      expect(getLogType('Using unstable API')).toBe('warning')
    })

    test('detects warning emoji', () => {
      expect(getLogType('⚠️ Configuration might be invalid')).toBe('warning')
    })
  })

  describe('success detection', () => {
    test('detects "successfully" keyword', () => {
      expect(getLogType('Build completed successfully')).toBe('success')
    })

    test('detects "completed" keyword', () => {
      expect(getLogType('Task completed')).toBe('success')
    })

    test('detects "listening" keyword', () => {
      expect(getLogType('Server listening on port 3000')).toBe('success')
    })

    test('detects "connected" keyword', () => {
      expect(getLogType('Database connected')).toBe('success')
    })

    test('detects "ready" keyword', () => {
      expect(getLogType('Application ready')).toBe('success')
    })

    test('detects "started" keyword', () => {
      expect(getLogType('Server started')).toBe('success')
    })

    test('detects checkmark symbols', () => {
      expect(getLogType('✓ Tests passed')).toBe('success')
      expect(getLogType('✅ Deployment done')).toBe('success')
    })

    test('detects "done" keyword', () => {
      expect(getLogType('Build done in 5.2s')).toBe('success')
    })

    test('detects "healthy" keyword', () => {
      expect(getLogType('Container healthy')).toBe('success')
    })

    test('detects docker container states', () => {
      expect(getLogType('Image pulled')).toBe('success')
      expect(getLogType('Container created')).toBe('success')
      expect(getLogType('Container recreated')).toBe('success')
    })
  })

  describe('debug detection', () => {
    test('detects "debug" keyword', () => {
      expect(getLogType('[DEBUG] Variable value: 42')).toBe('debug')
    })

    test('detects "version" keyword', () => {
      expect(getLogType('Node.js version: 20.0.0')).toBe('debug')
    })

    test('detects "config" keyword', () => {
      expect(getLogType('Loading config from .env')).toBe('debug')
    })

    test('detects "import" keyword', () => {
      expect(getLogType('Importing module ./utils')).toBe('debug')
    })

    test('detects HTTP methods', () => {
      expect(getLogType('GET /api/users 200 15ms')).toBe('debug')
      expect(getLogType('POST /api/users 201 25ms')).toBe('debug')
      expect(getLogType('PUT /api/users/1 200 10ms')).toBe('debug')
      expect(getLogType('DELETE /api/users/1 204 5ms')).toBe('debug')
    })
  })

  describe('info (default)', () => {
    test('returns info for unmatched messages', () => {
      expect(getLogType('Starting application...')).toBe('info')
      expect(getLogType('Processing data')).toBe('info')
      expect(getLogType('Hello world')).toBe('info')
    })
  })

  describe('priority', () => {
    test('error takes priority over success', () => {
      // "failed" is error, even if "completed" is present
      expect(getLogType('Deployment completed but tests failed')).toBe('error')
    })

    test('error takes priority over warning', () => {
      expect(getLogType('Error: deprecated feature crashed')).toBe('error')
    })

    test('warning takes priority over success', () => {
      expect(getLogType('Started with warning')).toBe('warning')
    })
  })
})

describe('parseLogs', () => {
  test('parses multiline log string', () => {
    const logs = `Building project
Processing files
Build completed successfully`

    const result = parseLogs(logs)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ message: 'Building project', type: 'info' })
    expect(result[1]).toEqual({ message: 'Processing files', type: 'info' })
    expect(result[2]).toEqual({ message: 'Build completed successfully', type: 'success' })
  })

  test('filters empty lines', () => {
    const logs = `Line 1

Line 2

`
    const result = parseLogs(logs)
    expect(result).toHaveLength(2)
  })

  test('filters whitespace-only lines', () => {
    const logs = `Line 1

Line 2
\t
Line 3`
    const result = parseLogs(logs)
    expect(result).toHaveLength(3)
  })

  test('handles empty string', () => {
    expect(parseLogs('')).toEqual([])
  })

  test('preserves message content', () => {
    const logs = 'Error: Something went wrong at line 42'
    const result = parseLogs(logs)
    expect(result[0].message).toBe(logs)
  })

  test('assigns correct types to each line', () => {
    const logs = `Error: failed to connect
Warning: deprecated API
Successfully connected
Processing data
GET /api/status 200`

    const result = parseLogs(logs)

    expect(result[0].type).toBe('error')
    expect(result[1].type).toBe('warning')
    expect(result[2].type).toBe('success')
    expect(result[3].type).toBe('info')
    expect(result[4].type).toBe('debug')
  })
})
