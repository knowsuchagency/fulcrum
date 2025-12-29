import { Hono } from 'hono'
import { parse as parseYaml } from 'yaml'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { db, repositories, type NewRepository } from '../db'
import { eq } from 'drizzle-orm'
import { log } from '../lib/logger'
import { isGitUrl } from '../lib/git-utils'
import type {
  CopierQuestion,
  CopierQuestionType,
  CopierChoice,
  CopierQuestionsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
} from '../../shared/types'

const app = new Hono()

/**
 * Check if uv is installed
 */
function isUvInstalled(): boolean {
  try {
    execSync('uv --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Infer the Copier question type from a default value
 */
function inferType(value: unknown): CopierQuestionType {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'float'
  }
  return 'str'
}

/**
 * Parse choices from copier.yml format to our format
 */
function parseChoices(choices: unknown): CopierChoice[] | undefined {
  if (!choices) return undefined
  if (!Array.isArray(choices)) return undefined

  return choices.map((choice) => {
    if (typeof choice === 'object' && choice !== null) {
      // Object form: { label: "...", value: "..." }
      const c = choice as Record<string, unknown>
      return {
        label: String(c.label ?? c.value ?? choice),
        value: c.value ?? c.label ?? choice,
      } as CopierChoice
    }
    // Simple form: just the value
    return {
      label: String(choice),
      value: choice,
    } as CopierChoice
  })
}

/**
 * Parse copier.yml content into questions
 */
function parseCopierQuestions(yamlContent: string): CopierQuestion[] {
  const parsed = parseYaml(yamlContent) as Record<string, unknown>
  const questions: CopierQuestion[] = []

  for (const [name, config] of Object.entries(parsed)) {
    // Skip internal keys starting with _
    if (name.startsWith('_')) continue

    // Handle both short form (just default value) and full form (object with type, etc.)
    if (config === null || typeof config !== 'object') {
      // Short form: key: defaultValue
      questions.push({
        name,
        type: inferType(config),
        default: config,
      })
    } else {
      // Full form: key: { type, default, help, choices, ... }
      const q = config as Record<string, unknown>
      questions.push({
        name,
        type: (q.type as CopierQuestionType) || inferType(q.default),
        default: q.default,
        help: q.help as string | undefined,
        choices: parseChoices(q.choices),
        multiselect: q.multiselect as boolean | undefined,
      })
    }
  }

  return questions
}


/**
 * Fetch copier.yml from a git URL by shallow cloning
 */
function fetchCopierYamlFromGit(gitUrl: string): { content: string; cleanup: () => void } | null {
  const tempDir = mkdtempSync(join(tmpdir(), 'copier-template-'))

  try {
    // Shallow clone the repository
    execSync(`git clone --depth 1 "${gitUrl}" "${tempDir}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    // Look for copier.yml or copier.yaml
    const yamlPath = join(tempDir, 'copier.yml')
    const yamlAltPath = join(tempDir, 'copier.yaml')

    let content: string | null = null
    if (existsSync(yamlPath)) {
      content = readFileSync(yamlPath, 'utf-8')
    } else if (existsSync(yamlAltPath)) {
      content = readFileSync(yamlAltPath, 'utf-8')
    }

    if (!content) {
      rmSync(tempDir, { recursive: true, force: true })
      return null
    }

    return {
      content,
      cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
    }
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true })
    throw err
  }
}

/**
 * Fetch copier.yml from a template source (repo ID, local path, or git URL)
 */
async function fetchCopierYaml(
  source: string
): Promise<{ content: string; templatePath: string; cleanup?: () => void }> {
  // Check if source is a repository ID
  const repo = db.select().from(repositories).where(eq(repositories.id, source)).get()
  const templatePath = repo ? repo.path : source

  // Case 1: Local path
  if (existsSync(templatePath)) {
    const yamlPath = join(templatePath, 'copier.yml')
    const yamlAltPath = join(templatePath, 'copier.yaml')

    if (existsSync(yamlPath)) {
      return { content: readFileSync(yamlPath, 'utf-8'), templatePath }
    }
    if (existsSync(yamlAltPath)) {
      return { content: readFileSync(yamlAltPath, 'utf-8'), templatePath }
    }
    throw new Error('copier.yml not found in template directory')
  }

  // Case 2: Git URL
  if (isGitUrl(templatePath)) {
    const result = fetchCopierYamlFromGit(templatePath)
    if (!result) {
      throw new Error('copier.yml not found in git repository')
    }
    return { content: result.content, templatePath, cleanup: result.cleanup }
  }

  throw new Error('Template source not found')
}

// GET /api/copier/questions - Fetch questions from a template
app.get('/questions', async (c) => {
  const source = c.req.query('source')
  if (!source) {
    return c.json({ error: 'source parameter is required' }, 400)
  }

  let cleanup: (() => void) | undefined

  try {
    const result = await fetchCopierYaml(source)
    cleanup = result.cleanup

    const questions = parseCopierQuestions(result.content)
    const response: CopierQuestionsResponse = {
      questions,
      templatePath: result.templatePath,
    }

    return c.json(response)
  } catch (err) {
    log.api.error('Failed to fetch copier questions', { source, error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to parse template' }, 500)
  } finally {
    cleanup?.()
  }
})

// POST /api/copier/create - Create project from template
app.post('/create', async (c) => {
  let answersFile: string | null = null

  try {
    const body = await c.req.json<CreateProjectRequest>()
    const { templateSource, outputPath, answers, projectName, trust } = body

    // Validate inputs first
    if (!templateSource || !outputPath || !projectName) {
      return c.json({ error: 'templateSource, outputPath, and projectName are required' }, 400)
    }

    // Resolve template path
    const repo = db.select().from(repositories).where(eq(repositories.id, templateSource)).get()
    const templatePath = repo ? repo.path : templateSource

    // Build full output path
    const fullOutputPath = join(outputPath, projectName)

    // Check if output already exists
    if (existsSync(fullOutputPath)) {
      return c.json({ error: `Output directory already exists: ${fullOutputPath}` }, 400)
    }

    // Check if uv is installed (after request/directory validation)
    if (!isUvInstalled()) {
      return c.json(
        {
          error:
            'uv is not installed. Please install it first: https://docs.astral.sh/uv/getting-started/installation/',
        },
        400
      )
    }

    // Filter out answers that are Jinja2 templates (copier will evaluate them)
    const filteredAnswers: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(answers)) {
      // Skip values that contain Jinja2 template syntax - copier will compute these
      if (typeof value === 'string' && value.includes('{{')) {
        continue
      }
      filteredAnswers[key] = value
    }

    // Create answers file in temp directory
    answersFile = join(tmpdir(), `copier-answers-${crypto.randomUUID()}.json`)
    writeFileSync(answersFile, JSON.stringify(filteredAnswers))

    // Execute copier via uvx
    try {
      const trustFlag = trust ? '--trust ' : ''
      execSync(
        `uvx copier copy --data-file "${answersFile}" --force --vcs-ref HEAD ${trustFlag}"${templatePath}" "${fullOutputPath}"`,
        {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120000, // 2 minute timeout
        }
      )
    } catch (err) {
      const error = err as { stderr?: string; message?: string }
      const errorMessage = error.stderr || error.message || 'Copier execution failed'
      log.api.error('Copier execution failed', { templatePath, outputPath: fullOutputPath, error: errorMessage })
      return c.json({ error: errorMessage }, 500)
    }

    // Auto-add created project as repository
    const now = new Date().toISOString()
    const newRepoId = crypto.randomUUID()
    db.insert(repositories)
      .values({
        id: newRepoId,
        path: fullOutputPath,
        displayName: projectName,
        isCopierTemplate: false,
        createdAt: now,
        updatedAt: now,
      } as NewRepository)
      .run()

    log.api.info('Created project from template', {
      templatePath,
      outputPath: fullOutputPath,
      repositoryId: newRepoId,
    })

    const response: CreateProjectResponse = {
      success: true,
      projectPath: fullOutputPath,
      repositoryId: newRepoId,
    }

    return c.json(response, 201)
  } catch (err) {
    log.api.error('Failed to create project from template', { error: String(err) })
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create project' }, 500)
  } finally {
    // Clean up answers file
    if (answersFile && existsSync(answersFile)) {
      unlinkSync(answersFile)
    }
  }
})

export default app
