import { Hono } from 'hono'
import { spawn } from 'child_process'
import { log } from '../lib/logger'

const app = new Hono()

interface OpencodeModelsResponse {
  installed: boolean
  providers: Record<string, string[]>
  models: string[] // Flat list for convenience
}

/**
 * Run `opencode models` CLI command and parse the output.
 * Returns grouped models by provider.
 */
async function fetchOpencodeModels(): Promise<OpencodeModelsResponse> {
  return new Promise((resolve) => {
    const proc = spawn('opencode', ['models'], {
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      log.server.warn('opencode command not found', { error: err.message })
      resolve({
        installed: false,
        providers: {},
        models: [],
      })
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        log.server.warn('opencode models command failed', { code, stderr })
        resolve({
          installed: false,
          providers: {},
          models: [],
        })
        return
      }

      // Parse the output - each line is "provider/model"
      const lines = stdout.trim().split('\n').filter(Boolean)
      const providers: Record<string, string[]> = {}
      const models: string[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        models.push(trimmed)

        const slashIndex = trimmed.indexOf('/')
        if (slashIndex > 0) {
          const provider = trimmed.substring(0, slashIndex)
          const model = trimmed.substring(slashIndex + 1)
          if (!providers[provider]) {
            providers[provider] = []
          }
          providers[provider].push(model)
        }
      }

      resolve({
        installed: true,
        providers,
        models,
      })
    })
  })
}

/**
 * GET /api/opencode/models
 * Fetch available OpenCode models by running the CLI command.
 */
app.get('/models', async (c) => {
  const result = await fetchOpencodeModels()
  return c.json(result)
})

export default app
