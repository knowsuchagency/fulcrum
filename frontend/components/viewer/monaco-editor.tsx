import { useCallback, useRef } from 'react'
import Editor, { type OnMount, type OnChange, loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from 'next-themes'

// Configure Monaco loader to use jsDelivr CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
  },
})

interface MonacoEditorProps {
  filePath: string
  content: string
  onChange: (value: string) => void
  readOnly?: boolean
}

/**
 * Map file extension to Monaco language ID
 */
function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''

  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    mdx: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini', // Monaco doesn't have native TOML, ini is close
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    xml: 'xml',
    svg: 'xml',
    txt: 'plaintext',
    log: 'plaintext',
    gitignore: 'plaintext',
    dockerignore: 'plaintext',
    env: 'plaintext',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    rb: 'ruby',
    php: 'php',
    lua: 'lua',
    r: 'r',
    graphql: 'graphql',
    gql: 'graphql',
  }

  return langMap[ext] || 'plaintext'
}

export function MonacoEditor({
  filePath,
  content,
  onChange,
  readOnly = false,
}: MonacoEditorProps) {
  const { resolvedTheme } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value)
      }
    },
    [onChange]
  )

  const language = getMonacoLanguage(filePath)
  const theme = resolvedTheme === 'light' ? 'vs-light' : 'vs-dark'

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme={theme}
      onChange={handleChange}
      onMount={handleMount}
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Loading editor...
        </div>
      }
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        lineNumbers: 'on',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        folding: true,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        selectOnLineNumbers: true,
        padding: { top: 8, bottom: 8 },
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible',
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        contextmenu: true,
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: 'off',
        snippetSuggestions: 'none',
        wordBasedSuggestions: 'off',
      }}
    />
  )
}
