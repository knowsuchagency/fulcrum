import { Hono } from 'hono'
import { spawn } from 'child_process'
import { log } from '../lib/logger'

const app = new Hono()

interface OpencodeModelsResponse {
  installed: boolean
  providers: Record<string, string[]>
  models: string[] // Flat list for convenience
  configuredProviders: string[] // Providers with credentials configured
}

// Map display names from `opencode auth list` to provider IDs used in models
const PROVIDER_NAME_MAP: Record<string, string> = {
  'z.ai coding plan': 'zai-coding-plan',
  'anthropic': 'anthropic',
  'openai': 'openai',
  'google': 'google',
  'opencode': 'opencode',
  'groq': 'groq',
  'xai': 'xai',
  'deepseek': 'deepseek',
  'mistral': 'mistral',
  'azure': 'azure',
  'bedrock': 'bedrock',
  'vertex': 'vertex',
  'ollama': 'ollama',
  'openrouter': 'openrouter',
  'copilot': 'copilot',
}

/**
 * Run `opencode auth list` to get configured providers.
 * Returns array of provider IDs that have credentials configured.
 */
async function fetchConfiguredProviders(): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn('opencode', ['auth', 'list'], {
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1' },
    })

    let stdout = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.on('error', () => {
      resolve([])
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve([])
        return
      }

      // Parse lines like "●  Anthropic [90moauth" or "●  Z.AI Coding Plan [90mapi"
      // The ● is Unicode (U+25CF), and there may be ANSI codes
      // Strip all ANSI escape codes first
      const cleanOutput = stdout.replace(/\x1b\[[0-9;]*m/g, '')

      const providers: string[] = []
      const lines = cleanOutput.split('\n')

      for (const line of lines) {
        // Match lines with provider name followed by auth type (api, oauth, token, key)
        // The line format is: {bullet}  {Provider Name} {auth method}
        const match = line.match(/[●○]\s+(.+?)\s+(api|oauth|token|key)\s*$/i)
        if (match) {
          const displayName = match[1].trim().toLowerCase()
          const providerId = PROVIDER_NAME_MAP[displayName] || displayName.replace(/\s+/g, '-')
          providers.push(providerId)
          log.server.debug('Parsed configured provider', { displayName, providerId })
        }
      }

      log.server.debug('Configured providers', { providers })
      resolve(providers)
    })
  })
}

/**
 * Run `opencode models` CLI command and parse the output.
 * Returns grouped models by provider, filtered to only configured providers.
 */
async function fetchOpencodeModels(): Promise<OpencodeModelsResponse> {
  // Fetch configured providers first
  const configuredProviders = await fetchConfiguredProviders()

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
        configuredProviders: [],
      })
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        log.server.warn('opencode models command failed', { code, stderr })
        resolve({
          installed: false,
          providers: {},
          models: [],
          configuredProviders: [],
        })
        return
      }

      // Parse the output - each line is "provider/model"
      const lines = stdout.trim().split('\n').filter(Boolean)
      const allProviders: Record<string, string[]> = {}
      const allModels: string[] = []

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        allModels.push(trimmed)

        const slashIndex = trimmed.indexOf('/')
        if (slashIndex > 0) {
          const provider = trimmed.substring(0, slashIndex)
          const model = trimmed.substring(slashIndex + 1)
          if (!allProviders[provider]) {
            allProviders[provider] = []
          }
          allProviders[provider].push(model)
        }
      }

      // Filter to only configured providers (if any are configured)
      // If no providers are configured, show all (fallback)
      const hasConfigured = configuredProviders.length > 0
      const providers: Record<string, string[]> = {}
      const models: string[] = []

      for (const [provider, providerModels] of Object.entries(allProviders)) {
        if (!hasConfigured || configuredProviders.includes(provider)) {
          providers[provider] = providerModels
          for (const model of providerModels) {
            models.push(`${provider}/${model}`)
          }
        }
      }

      resolve({
        installed: true,
        providers,
        models,
        configuredProviders,
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
