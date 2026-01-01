import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findComposeFile, parseComposeFile } from './compose-parser'

describe('Compose Parser', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'compose-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('findComposeFile', () => {
    test('finds compose.yml', async () => {
      writeFileSync(join(tempDir, 'compose.yml'), 'version: "3"')
      const result = await findComposeFile(tempDir)
      expect(result).toBe('compose.yml')
    })

    test('finds compose.yaml', async () => {
      writeFileSync(join(tempDir, 'compose.yaml'), 'version: "3"')
      const result = await findComposeFile(tempDir)
      expect(result).toBe('compose.yaml')
    })

    test('finds docker-compose.yml', async () => {
      writeFileSync(join(tempDir, 'docker-compose.yml'), 'version: "3"')
      const result = await findComposeFile(tempDir)
      expect(result).toBe('docker-compose.yml')
    })

    test('finds docker-compose.yaml', async () => {
      writeFileSync(join(tempDir, 'docker-compose.yaml'), 'version: "3"')
      const result = await findComposeFile(tempDir)
      expect(result).toBe('docker-compose.yaml')
    })

    test('prefers compose.yml over docker-compose.yml', async () => {
      writeFileSync(join(tempDir, 'compose.yml'), 'version: "3"')
      writeFileSync(join(tempDir, 'docker-compose.yml'), 'version: "3"')
      const result = await findComposeFile(tempDir)
      expect(result).toBe('compose.yml')
    })

    test('returns null when no compose file exists', async () => {
      const result = await findComposeFile(tempDir)
      expect(result).toBeNull()
    })
  })

  describe('parseComposeFile', () => {
    test('parses simple compose file with one service', async () => {
      const yaml = `
services:
  web:
    image: nginx
    ports:
      - 80
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.file).toBe('compose.yml')
      expect(result.services).toHaveLength(1)
      expect(result.services[0].name).toBe('web')
      expect(result.services[0].image).toBe('nginx')
      expect(result.services[0].ports).toHaveLength(1)
      expect(result.services[0].ports![0].container).toBe(80)
    })

    test('parses multi-service compose file', async () => {
      const yaml = `
services:
  web:
    image: nginx
    ports:
      - 80
  api:
    image: node
    ports:
      - 3000
  db:
    image: postgres
    ports:
      - 5432
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services).toHaveLength(3)
      expect(result.services.map((s) => s.name).sort()).toEqual(['api', 'db', 'web'])
    })

    test('extracts port from number syntax', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - 3000
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
      expect(result.services[0].ports![0].host).toBeUndefined()
    })

    test('extracts port from string syntax', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - "3000"
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
    })

    test('extracts host and container port from mapping', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - "8080:3000"
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
      expect(result.services[0].ports![0].host).toBe(8080)
    })

    test('handles IP:host:container format', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - "127.0.0.1:8080:3000"
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
      expect(result.services[0].ports![0].host).toBe(8080)
    })

    test('handles port with protocol suffix', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - "8080:3000/tcp"
      - "5353:53/udp"
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
      expect(result.services[0].ports![0].protocol).toBe('tcp')
      expect(result.services[0].ports![1].container).toBe(53)
      expect(result.services[0].ports![1].protocol).toBe('udp')
    })

    test('handles long syntax port format', async () => {
      const yaml = `
services:
  app:
    image: app
    ports:
      - target: 3000
        published: 8080
        protocol: tcp
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].ports![0].container).toBe(3000)
      expect(result.services[0].ports![0].host).toBe(8080)
      expect(result.services[0].ports![0].protocol).toBe('tcp')
    })

    test('handles service with no ports', async () => {
      const yaml = `
services:
  worker:
    image: worker
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].name).toBe('worker')
      expect(result.services[0].ports).toBeUndefined()
    })

    test('parses build configuration (string)', async () => {
      const yaml = `
services:
  app:
    build: ./app
    ports:
      - 3000
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].build).toEqual({ context: './app' })
    })

    test('parses build configuration (object)', async () => {
      const yaml = `
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
    ports:
      - 3000
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].build).toEqual({
        context: './app',
        dockerfile: 'Dockerfile.prod',
      })
    })

    test('parses environment variables (array format)', async () => {
      const yaml = `
services:
  app:
    image: app
    environment:
      - NODE_ENV=production
      - DEBUG=true
      - EMPTY_VAR
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].environment).toEqual({
        NODE_ENV: 'production',
        DEBUG: 'true',
        EMPTY_VAR: '',
      })
    })

    test('parses environment variables (object format)', async () => {
      const yaml = `
services:
  app:
    image: app
    environment:
      NODE_ENV: production
      PORT: 3000
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services[0].environment).toEqual({
        NODE_ENV: 'production',
        PORT: '3000',
      })
    })

    test('parses depends_on (array format)', async () => {
      const yaml = `
services:
  app:
    image: app
    depends_on:
      - db
      - redis
  db:
    image: postgres
  redis:
    image: redis
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      const app = result.services.find((s) => s.name === 'app')
      expect(app?.depends_on).toEqual(['db', 'redis'])
    })

    test('parses depends_on (long format)', async () => {
      const yaml = `
services:
  app:
    image: app
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
  db:
    image: postgres
  redis:
    image: redis
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      const app = result.services.find((s) => s.name === 'app')
      expect(app?.depends_on?.sort()).toEqual(['db', 'redis'])
    })

    test('returns empty services for compose file with no services', async () => {
      const yaml = `
version: "3"
`
      writeFileSync(join(tempDir, 'compose.yml'), yaml)

      const result = await parseComposeFile(tempDir)

      expect(result.services).toEqual([])
    })

    test('throws error for non-existent compose file', async () => {
      await expect(parseComposeFile(tempDir)).rejects.toThrow('No compose file found')
    })

    test('throws error for invalid YAML', async () => {
      writeFileSync(join(tempDir, 'compose.yml'), 'not: valid: yaml: content:')

      await expect(parseComposeFile(tempDir)).rejects.toThrow()
    })

    test('uses specified compose file name', async () => {
      const yaml = `
services:
  custom:
    image: custom
`
      writeFileSync(join(tempDir, 'custom-compose.yml'), yaml)

      const result = await parseComposeFile(tempDir, 'custom-compose.yml')

      expect(result.file).toBe('custom-compose.yml')
      expect(result.services[0].name).toBe('custom')
    })
  })
})
