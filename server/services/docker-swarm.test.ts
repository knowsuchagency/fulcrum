import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { generateSwarmComposeFile } from './docker-swarm'
import { parse as parseYaml } from 'yaml'

describe('docker-swarm', () => {
  describe('generateSwarmComposeFile', () => {
    let tempDir: string
    let outputDir: string

    beforeEach(async () => {
      // Create temp directories for test
      tempDir = join(tmpdir(), `swarm-test-${Date.now()}`)
      outputDir = join(tempDir, 'output')
      await mkdir(tempDir, { recursive: true })
      await mkdir(outputDir, { recursive: true })
    })

    afterEach(async () => {
      // Cleanup
      await rm(tempDir, { recursive: true, force: true })
    })

    test('expands port env vars using provided env parameter', async () => {
      // Create a compose file with env var in port
      const composeContent = `
services:
  app:
    image: nginx
    ports:
      - "\${PORT:-8090}:8090"
`
      await writeFile(join(tempDir, 'docker-compose.yml'), composeContent)

      // Generate swarm file WITH env var specifying a different port
      const result = await generateSwarmComposeFile(
        tempDir,
        'docker-compose.yml',
        'test-project',
        undefined,
        outputDir,
        { PORT: '3005' } // Custom port from env
      )

      expect(result.success).toBe(true)

      // Read and parse the generated file
      const swarmContent = await readFile(result.swarmFile, 'utf-8')
      const parsed = parseYaml(swarmContent)

      // The port should be expanded to 3005 (from env), not 8090 (default)
      const ports = parsed.services.app.ports
      expect(ports).toHaveLength(1)
      expect(ports[0].published).toBe(3005)
      expect(ports[0].target).toBe(8090)
      expect(ports[0].mode).toBe('host')
    })

    test('uses default port when env var is not provided', async () => {
      const composeContent = `
services:
  app:
    image: nginx
    ports:
      - "\${PORT:-8090}:8090"
`
      await writeFile(join(tempDir, 'docker-compose.yml'), composeContent)

      // Generate without env var - should use default
      const result = await generateSwarmComposeFile(
        tempDir,
        'docker-compose.yml',
        'test-project',
        undefined,
        outputDir
        // No env parameter
      )

      expect(result.success).toBe(true)

      const swarmContent = await readFile(result.swarmFile, 'utf-8')
      const parsed = parseYaml(swarmContent)

      const ports = parsed.services.app.ports
      expect(ports[0].published).toBe(8090) // Default value
      expect(ports[0].target).toBe(8090)
    })

    test('expands multiple port env vars', async () => {
      const composeContent = `
services:
  web:
    image: nginx
    ports:
      - "\${WEB_PORT:-80}:80"
  api:
    image: node
    ports:
      - "\${API_PORT:-3000}:3000"
`
      await writeFile(join(tempDir, 'docker-compose.yml'), composeContent)

      const result = await generateSwarmComposeFile(
        tempDir,
        'docker-compose.yml',
        'test-project',
        undefined,
        outputDir,
        { WEB_PORT: '8080', API_PORT: '4000' }
      )

      expect(result.success).toBe(true)

      const swarmContent = await readFile(result.swarmFile, 'utf-8')
      const parsed = parseYaml(swarmContent)

      expect(parsed.services.web.ports[0].published).toBe(8080)
      expect(parsed.services.api.ports[0].published).toBe(4000)
    })

    test('handles mixed env var and literal ports', async () => {
      const composeContent = `
services:
  app:
    image: nginx
    ports:
      - "\${PORT:-8080}:80"
      - "443:443"
`
      await writeFile(join(tempDir, 'docker-compose.yml'), composeContent)

      const result = await generateSwarmComposeFile(
        tempDir,
        'docker-compose.yml',
        'test-project',
        undefined,
        outputDir,
        { PORT: '9000' }
      )

      expect(result.success).toBe(true)

      const swarmContent = await readFile(result.swarmFile, 'utf-8')
      const parsed = parseYaml(swarmContent)

      const ports = parsed.services.app.ports
      expect(ports).toHaveLength(2)
      expect(ports[0].published).toBe(9000) // From env
      expect(ports[0].target).toBe(80)
      expect(ports[1].published).toBe(443) // Literal
      expect(ports[1].target).toBe(443)
    })
  })
})
