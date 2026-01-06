import { Hono } from 'hono'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface DirectoryEntry {
  name: string
  type: 'file' | 'directory'
  isGitRepo: boolean
}

interface TreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeEntry[]
}

interface FileReadResponse {
  content: string
  mimeType: string
  size: number
  lineCount: number
  truncated: boolean
}

// Check if a directory is a git repository
function isGitRepo(dirPath: string): boolean {
  try {
    const gitDir = path.join(dirPath, '.git')
    return fs.existsSync(gitDir)
  } catch {
    return false
  }
}

// Check if path is within allowed root (path traversal protection)
function isPathWithinRoot(filePath: string, root: string): boolean {
  const resolvedPath = path.resolve(filePath)
  const resolvedRoot = path.resolve(root)
  return resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot
}

// Directories to exclude from tree traversal (large dependency/build directories)
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  'target',
  '.venv',
  'venv',
  'env',
  '.tox',
  'coverage',
  '.cache',
  'bower_components',
])

// Build recursive directory tree
function buildTree(dirPath: string, root: string, depth: number = 0, maxDepth: number = 20): TreeEntry[] {
  if (depth >= maxDepth) return []

  const entries: TreeEntry[] = []

  try {
    const items = fs.readdirSync(dirPath)

    for (const name of items) {
      // Skip excluded directories (large dependency/build directories)
      if (EXCLUDED_DIRECTORIES.has(name)) continue

      try {
        const itemPath = path.join(dirPath, name)
        const relativePath = path.relative(root, itemPath)
        const itemStat = fs.statSync(itemPath)

        if (itemStat.isDirectory()) {
          entries.push({
            name,
            path: relativePath,
            type: 'directory',
            children: buildTree(itemPath, root, depth + 1, maxDepth),
          })
        } else if (itemStat.isFile()) {
          entries.push({
            name,
            path: relativePath,
            type: 'file',
          })
        }
      } catch {
        // Skip items we can't access
      }
    }
  } catch {
    // Return empty if can't read directory
  }

  // Sort: directories first, then alphabetically
  entries.sort((a, b) => {
    if (a.type === 'directory' && b.type === 'file') return -1
    if (a.type === 'file' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

// Detect if content is binary
function isBinaryContent(buffer: Buffer): boolean {
  // Check first 8000 bytes for null bytes
  const checkLength = Math.min(buffer.length, 8000)
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

// Get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/toml',
    '.sh': 'text/x-shellscript',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.go': 'text/x-go',
    '.sql': 'text/x-sql',
  }
  return mimeTypes[ext] || 'text/plain'
}

const app = new Hono()

// GET /api/fs/list?path=/home/user
app.get('/list', (c) => {
  let dirPath = c.req.query('path') || os.homedir()

  // Expand ~ to home directory
  if (dirPath === '~') {
    dirPath = os.homedir()
  } else if (dirPath.startsWith('~/')) {
    dirPath = path.join(os.homedir(), dirPath.slice(2))
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath)

  try {
    if (!fs.existsSync(dirPath)) {
      return c.json({ error: 'Path does not exist' }, 404)
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return c.json({ error: 'Path is not a directory' }, 400)
    }

    const entries: DirectoryEntry[] = []
    const items = fs.readdirSync(dirPath)

    for (const name of items) {
      // Skip hidden files/directories
      if (name.startsWith('.')) continue

      try {
        const itemPath = path.join(dirPath, name)
        const itemStat = fs.statSync(itemPath)

        if (itemStat.isDirectory()) {
          entries.push({
            name,
            type: 'directory',
            isGitRepo: isGitRepo(itemPath),
          })
        } else if (itemStat.isFile()) {
          entries.push({
            name,
            type: 'file',
            isGitRepo: false,
          })
        }
      } catch {
        // Skip items we can't access
      }
    }

    // Sort: directories first (git repos at top), then files
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'directory') return 1
      if (a.type === 'directory' && b.type === 'directory') {
        if (a.isGitRepo && !b.isGitRepo) return -1
        if (!a.isGitRepo && b.isGitRepo) return 1
      }
      return a.name.localeCompare(b.name)
    })

    return c.json({
      path: dirPath,
      parent: path.dirname(dirPath),
      entries,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to list directory' }, 500)
  }
})

// GET /api/fs/tree?root=/path/to/worktree
app.get('/tree', (c) => {
  const root = c.req.query('root')

  if (!root) {
    return c.json({ error: 'root parameter is required' }, 400)
  }

  const resolvedRoot = path.resolve(root)

  try {
    if (!fs.existsSync(resolvedRoot)) {
      return c.json({ error: 'Root path does not exist' }, 404)
    }

    const stat = fs.statSync(resolvedRoot)
    if (!stat.isDirectory()) {
      return c.json({ error: 'Root path is not a directory' }, 400)
    }

    const entries = buildTree(resolvedRoot, resolvedRoot)

    return c.json({
      root: resolvedRoot,
      entries,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to build tree' }, 500)
  }
})

// GET /api/fs/read?path=/path/to/file&root=/worktree/root&maxLines=5000
app.get('/read', (c) => {
  const filePath = c.req.query('path')
  const root = c.req.query('root')
  const maxLines = parseInt(c.req.query('maxLines') || '5000', 10)

  if (!filePath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  if (!root) {
    return c.json({ error: 'root parameter is required' }, 400)
  }

  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, filePath)

  // Security: validate path is within root
  if (!isPathWithinRoot(resolvedPath, resolvedRoot)) {
    return c.json({ error: 'Access denied: path outside root' }, 403)
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      return c.json({ error: 'File not found' }, 404)
    }

    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      return c.json({ error: 'Path is not a file' }, 400)
    }

    const mimeType = getMimeType(resolvedPath)

    // Handle images - return as base64
    if (mimeType.startsWith('image/')) {
      const buffer = fs.readFileSync(resolvedPath)
      const base64 = buffer.toString('base64')
      return c.json({
        content: `data:${mimeType};base64,${base64}`,
        mimeType,
        size: stat.size,
        lineCount: 0,
        truncated: false,
      } satisfies FileReadResponse)
    }

    // Read file content
    const buffer = fs.readFileSync(resolvedPath)

    // Check if binary
    if (isBinaryContent(buffer)) {
      return c.json({
        content: '',
        mimeType: 'application/octet-stream',
        size: stat.size,
        lineCount: 0,
        truncated: false,
      } satisfies FileReadResponse)
    }

    // Text file
    const fullContent = buffer.toString('utf-8')
    const lines = fullContent.split('\n')
    const totalLines = lines.length
    const truncated = totalLines > maxLines
    const content = truncated ? lines.slice(0, maxLines).join('\n') : fullContent

    return c.json({
      content,
      mimeType,
      size: stat.size,
      lineCount: totalLines,
      truncated,
    } satisfies FileReadResponse)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to read file' }, 500)
  }
})

// GET /api/fs/image?path=/path/to/image&root=/worktree/root
// Returns raw image data with proper content-type (for use in <img> tags)
app.get('/image', (c) => {
  const filePath = c.req.query('path')
  const root = c.req.query('root')

  if (!filePath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  if (!root) {
    return c.json({ error: 'root parameter is required' }, 400)
  }

  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, filePath)

  // Security: validate path is within root
  if (!isPathWithinRoot(resolvedPath, resolvedRoot)) {
    return c.json({ error: 'Access denied: path outside root' }, 403)
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      return c.json({ error: 'File not found' }, 404)
    }

    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      return c.json({ error: 'Path is not a file' }, 400)
    }

    const mimeType = getMimeType(resolvedPath)

    // Only serve images
    if (!mimeType.startsWith('image/')) {
      return c.json({ error: 'Not an image file' }, 400)
    }

    const buffer = fs.readFileSync(resolvedPath)

    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to read image' }, 500)
  }
})

// POST /api/fs/write
// Body: { path: string, root: string, content: string }
app.post('/write', async (c) => {
  const body = await c.req.json<{ path?: string; root?: string; content?: string }>()
  const { path: filePath, root, content } = body

  if (!filePath) {
    return c.json({ error: 'path is required' }, 400)
  }

  if (!root) {
    return c.json({ error: 'root is required' }, 400)
  }

  if (content === undefined) {
    return c.json({ error: 'content is required' }, 400)
  }

  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, filePath)

  // Security: validate path is within root
  if (!isPathWithinRoot(resolvedPath, resolvedRoot)) {
    return c.json({ error: 'Access denied: path outside root' }, 403)
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      return c.json({ error: 'File not found' }, 404)
    }

    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      return c.json({ error: 'Path is not a file' }, 400)
    }

    // Write the content
    fs.writeFileSync(resolvedPath, content, 'utf-8')

    return c.json({ success: true, size: Buffer.byteLength(content, 'utf-8') })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to write file' }, 500)
  }
})

// GET /api/fs/stat?path=/path/to/check
// Returns type and existence info for a path
app.get('/stat', (c) => {
  let targetPath = c.req.query('path')

  if (!targetPath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  // Expand ~ to home directory
  if (targetPath === '~') {
    targetPath = os.homedir()
  } else if (targetPath.startsWith('~/')) {
    targetPath = path.join(os.homedir(), targetPath.slice(2))
  }

  // Resolve to absolute path
  targetPath = path.resolve(targetPath)

  try {
    if (!fs.existsSync(targetPath)) {
      return c.json({
        path: targetPath,
        exists: false,
        type: null,
        isDirectory: false,
        isFile: false,
      })
    }

    const stat = fs.statSync(targetPath)
    const isDir = stat.isDirectory()
    const isFile = stat.isFile()

    return c.json({
      path: targetPath,
      exists: true,
      type: isDir ? 'directory' : isFile ? 'file' : 'other',
      isDirectory: isDir,
      isFile: isFile,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to stat path' }, 500)
  }
})

// GET /api/fs/is-git-repo?path=/path/to/check
app.get('/is-git-repo', (c) => {
  let dirPath = c.req.query('path')

  if (!dirPath) {
    return c.json({ error: 'path parameter is required' }, 400)
  }

  // Expand ~ to home directory
  if (dirPath === '~') {
    dirPath = os.homedir()
  } else if (dirPath.startsWith('~/')) {
    dirPath = path.join(os.homedir(), dirPath.slice(2))
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath)

  try {
    if (!fs.existsSync(dirPath)) {
      return c.json({ error: 'Path does not exist' }, 404)
    }

    const stat = fs.statSync(dirPath)
    if (!stat.isDirectory()) {
      return c.json({ error: 'Path is not a directory' }, 400)
    }

    const isRepo = isGitRepo(dirPath)

    return c.json({
      path: dirPath,
      isGitRepo: isRepo,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to check path' }, 500)
  }
})

export default app
