import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null
let initPromise: Promise<Highlighter> | null = null

const COMMON_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'css',
  'html',
  'markdown',
  'yaml',
  'toml',
  'bash',
  'shell',
  'python',
  'rust',
  'go',
  'sql',
  'diff',
  'plaintext',
  'ini',
  'xml',
]

async function initHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter
  if (initPromise) return initPromise

  initPromise = createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: COMMON_LANGS,
  })

  highlighter = await initPromise
  return highlighter
}

export type ShikiTheme = 'light' | 'dark'

export async function highlightCode(
  code: string,
  lang: string,
  theme: ShikiTheme = 'dark'
): Promise<string> {
  const hl = await initHighlighter()
  const shikiTheme = theme === 'light' ? 'github-light' : 'github-dark'

  // Normalize language name
  const normalizedLang = normalizeLang(lang)

  // Check if language is loaded
  const loadedLangs = hl.getLoadedLanguages()
  if (!loadedLangs.includes(normalizedLang as typeof loadedLangs[number])) {
    // Try to load the language dynamically
    try {
      await hl.loadLanguage(normalizedLang as Parameters<typeof hl.loadLanguage>[0])
    } catch {
      // Fall back to plaintext
      return hl.codeToHtml(code, { lang: 'plaintext', theme: shikiTheme })
    }
  }

  return hl.codeToHtml(code, { lang: normalizedLang, theme: shikiTheme })
}

function normalizeLang(lang: string): string {
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    sh: 'bash',
    yml: 'yaml',
    md: 'markdown',
  }

  return langMap[lang] || lang
}

export function getLangFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''

  const extMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    diff: 'diff',
    txt: 'plaintext',
  }

  return extMap[ext] || 'plaintext'
}
