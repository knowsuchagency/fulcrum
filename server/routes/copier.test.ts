import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestApp } from '../__tests__/fixtures/app'
import { setupTestEnv, type TestEnv } from '../__tests__/utils/env'
import { db, repositories } from '../db'
import { eq } from 'drizzle-orm'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// Check if uv is installed
function isUvInstalled(): boolean {
  try {
    execSync('uv --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

describe('Copier Routes', () => {
  let testEnv: TestEnv
  let templateDir: string

  beforeEach(() => {
    testEnv = setupTestEnv()
    templateDir = mkdtempSync(join(tmpdir(), 'copier-template-test-'))
  })

  afterEach(() => {
    testEnv.cleanup()
    try {
      rmSync(templateDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('GET /api/copier/questions', () => {
    test('returns 400 when source parameter is missing', async () => {
      const { get } = createTestApp()
      const res = await get('/api/copier/questions')
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('source parameter is required')
    })

    test('returns questions from local template with copier.yml', async () => {
      // Create a copier.yml in the template directory
      const copierYaml = `
project_name:
  type: str
  default: "my-project"
  help: "Name of the project"

use_typescript:
  type: bool
  default: true

port:
  type: int
  default: 3000
`
      writeFileSync(join(templateDir, 'copier.yml'), copierYaml)

      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.questions).toBeDefined()
      expect(body.templatePath).toBe(templateDir)

      // Check questions are parsed correctly
      const projectName = body.questions.find((q: { name: string }) => q.name === 'project_name')
      expect(projectName).toBeDefined()
      expect(projectName.type).toBe('str')
      expect(projectName.default).toBe('my-project')
      expect(projectName.help).toBe('Name of the project')

      const useTypescript = body.questions.find((q: { name: string }) => q.name === 'use_typescript')
      expect(useTypescript).toBeDefined()
      expect(useTypescript.type).toBe('bool')
      expect(useTypescript.default).toBe(true)

      const port = body.questions.find((q: { name: string }) => q.name === 'port')
      expect(port).toBeDefined()
      expect(port.type).toBe('int')
      expect(port.default).toBe(3000)
    })

    test('returns questions from copier.yaml (alternate extension)', async () => {
      const copierYaml = `
name:
  default: "test"
`
      writeFileSync(join(templateDir, 'copier.yaml'), copierYaml)

      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.questions).toBeDefined()
      expect(body.questions.length).toBe(1)
      expect(body.questions[0].name).toBe('name')
    })

    test('returns 500 when copier.yml is not found', async () => {
      // Template directory exists but has no copier.yml
      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.error).toContain('copier.yml not found')
    })

    test('resolves repository ID to path', async () => {
      // Create a repository entry
      const now = new Date().toISOString()
      db.insert(repositories)
        .values({
          id: 'copier-repo-id',
          path: templateDir,
          displayName: 'Copier Template',
          isCopierTemplate: true,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      // Create copier.yml
      writeFileSync(join(templateDir, 'copier.yml'), 'name:\n  default: "from-repo"')

      const { get } = createTestApp()
      const res = await get('/api/copier/questions?source=copier-repo-id')
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.templatePath).toBe(templateDir)
    })

    test('parses questions with choices', async () => {
      const copierYaml = `
framework:
  type: str
  default: "react"
  choices:
    - react
    - vue
    - angular

features:
  type: str
  multiselect: true
  choices:
    - label: "Testing"
      value: "testing"
    - label: "Linting"
      value: "linting"
`
      writeFileSync(join(templateDir, 'copier.yml'), copierYaml)

      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(200)

      const framework = body.questions.find((q: { name: string }) => q.name === 'framework')
      expect(framework.choices).toBeDefined()
      expect(framework.choices.length).toBe(3)
      expect(framework.choices[0].value).toBe('react')

      const features = body.questions.find((q: { name: string }) => q.name === 'features')
      expect(features.multiselect).toBe(true)
      expect(features.choices[0].label).toBe('Testing')
      expect(features.choices[0].value).toBe('testing')
    })

    test('skips internal keys starting with underscore', async () => {
      const copierYaml = `
_min_copier_version: "9.0.0"
_templates_suffix: ".jinja"

visible_question:
  default: "visible"
`
      writeFileSync(join(templateDir, 'copier.yml'), copierYaml)

      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.questions.length).toBe(1)
      expect(body.questions[0].name).toBe('visible_question')
    })

    test('handles short form questions (just default value)', async () => {
      const copierYaml = `
string_var: "default string"
int_var: 42
bool_var: false
float_var: 3.14
`
      writeFileSync(join(templateDir, 'copier.yml'), copierYaml)

      const { get } = createTestApp()
      const res = await get(`/api/copier/questions?source=${encodeURIComponent(templateDir)}`)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.questions.length).toBe(4)

      const stringVar = body.questions.find((q: { name: string }) => q.name === 'string_var')
      expect(stringVar.type).toBe('str')
      expect(stringVar.default).toBe('default string')

      const intVar = body.questions.find((q: { name: string }) => q.name === 'int_var')
      expect(intVar.type).toBe('int')
      expect(intVar.default).toBe(42)

      const boolVar = body.questions.find((q: { name: string }) => q.name === 'bool_var')
      expect(boolVar.type).toBe('bool')
      expect(boolVar.default).toBe(false)

      const floatVar = body.questions.find((q: { name: string }) => q.name === 'float_var')
      expect(floatVar.type).toBe('float')
      expect(floatVar.default).toBe(3.14)
    })
  })

  describe('POST /api/copier/create', () => {
    test('returns 400 when required fields are missing', async () => {
      const { post } = createTestApp()
      const res = await post('/api/copier/create', {
        templateSource: templateDir,
        // Missing outputPath and projectName
      })
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('required')
    })

    test('returns 400 when output directory already exists', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'copier-output-'))
      const existingProject = join(outputDir, 'existing-project')
      mkdirSync(existingProject)

      try {
        const { post } = createTestApp()
        const res = await post('/api/copier/create', {
          templateSource: templateDir,
          outputPath: outputDir,
          projectName: 'existing-project',
          answers: {},
        })
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error).toContain('already exists')
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    })

    // Only run the full copier test if uv is installed
    const conditionalTest = isUvInstalled() ? test : test.skip

    conditionalTest('creates project from template', async () => {
      // Create a minimal copier template
      writeFileSync(
        join(templateDir, 'copier.yml'),
        `
project_name:
  type: str
  default: "test-project"
`
      )

      // Create a template file
      const templateSubdir = join(templateDir, '{{project_name}}')
      mkdirSync(templateSubdir)
      writeFileSync(join(templateSubdir, 'README.md'), '# {{project_name}}')

      const outputDir = mkdtempSync(join(tmpdir(), 'copier-output-'))

      try {
        const { post } = createTestApp()
        const res = await post('/api/copier/create', {
          templateSource: templateDir,
          outputPath: outputDir,
          projectName: 'my-new-project',
          answers: { project_name: 'my-new-project' },
        })
        const body = await res.json()

        expect(res.status).toBe(201)
        expect(body.success).toBe(true)
        expect(body.projectPath).toBe(join(outputDir, 'my-new-project'))
        expect(body.repositoryId).toBeDefined()

        // Verify the project was created
        expect(existsSync(join(outputDir, 'my-new-project'))).toBe(true)

        // Verify repository was added
        const repo = db.select().from(repositories).where(eq(repositories.id, body.repositoryId)).get()
        expect(repo).toBeDefined()
        expect(repo?.displayName).toBe('my-new-project')
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    })

    conditionalTest('filters out Jinja2 template answers', async () => {
      // Create a template that uses computed values
      writeFileSync(
        join(templateDir, 'copier.yml'),
        `
project_name:
  type: str
  default: "test"

project_slug:
  type: str
  default: "{{ project_name | lower | replace(' ', '-') }}"
`
      )

      const outputDir = mkdtempSync(join(tmpdir(), 'copier-output-'))

      try {
        const { post } = createTestApp()
        const res = await post('/api/copier/create', {
          templateSource: templateDir,
          outputPath: outputDir,
          projectName: 'filtered-test',
          answers: {
            project_name: 'My Project',
            project_slug: "{{ project_name | lower | replace(' ', '-') }}", // This should be filtered
          },
        })
        const body = await res.json()

        // Should succeed (copier handles the computed value)
        expect(res.status).toBe(201)
        expect(body.success).toBe(true)
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    })
  })
})
