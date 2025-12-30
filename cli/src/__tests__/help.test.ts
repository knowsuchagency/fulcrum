import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn } from 'bun'

describe('CLI help and version', () => {
  describe('--help', () => {
    test('displays help text', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('vibora CLI')
      expect(output).toContain('USAGE')
      expect(output).toContain('COMMANDS')
      expect(output).toContain('tasks')
      expect(output).toContain('git')
      expect(output).toContain('config')
      expect(output).toContain('OPTIONS')
      expect(output).toContain('--port')
      expect(output).toContain('--url')
      expect(output).toContain('--json')
    })

    test('displays help with no command', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('vibora CLI')
      expect(output).toContain('USAGE')
    })
  })

  describe('--version', () => {
    test('displays version from package.json', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      // Version should match package.json (dynamic import)
      // It should be a semver-like version string
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  describe('command documentation', () => {
    test('tasks command has subcommands', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'tasks', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('list')
      expect(output).toContain('get')
      expect(output).toContain('create')
      expect(output).toContain('update')
      expect(output).toContain('move')
      expect(output).toContain('delete')
    })

    test('git command has subcommands', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'git', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('status')
      expect(output).toContain('diff')
      expect(output).toContain('branches')
    })

    test('config command has subcommands', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'config', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('list')
      expect(output).toContain('get')
      expect(output).toContain('set')
      expect(output).toContain('reset')
    })

    test('notifications command has subcommands', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'notifications', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('enable')
      expect(output).toContain('disable')
      expect(output).toContain('test')
    })

    test('worktrees command has subcommands', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'worktrees', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('list')
      expect(output).toContain('delete')
    })

    test('help includes doctor command', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('doctor')
    })

    test('help includes health command', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      expect(output).toContain('health')
    })
  })

  describe('unknown command', () => {
    test('exits with error for unknown command', async () => {
      const proc = spawn(['bun', 'cli/src/index.ts', 'unknowncommand'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      // Citty exits with 1 for unknown commands
      expect(exitCode).not.toBe(0)
    })
  })
})
