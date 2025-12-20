import { Hono } from 'hono'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getViboraDir } from '../lib/settings'

const app = new Hono()

// Format: clipboard-2025-12-20-143022.png
function generateFilename(extension: string): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10) // 2025-12-20
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '') // 143022
  return `clipboard-${date}-${time}.${extension}`
}

// POST /api/uploads
// Accepts multipart form data with:
// - file: the image file
// - targetDir (optional): directory to save to (e.g., task worktree path)
app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  const targetDir = body['targetDir'] as string | undefined

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400)
  }

  // Validate it's an image
  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'File must be an image' }, 400)
  }

  // Determine extension from mime type
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  const extension = mimeToExt[file.type] || 'png'

  // Determine save directory
  let saveDir: string
  if (targetDir && existsSync(targetDir)) {
    saveDir = targetDir
  } else {
    saveDir = join(getViboraDir(), 'uploads')
  }

  // Ensure directory exists
  if (!existsSync(saveDir)) {
    await mkdir(saveDir, { recursive: true })
  }

  // Generate filename and save
  const filename = generateFilename(extension)
  const filePath = join(saveDir, filename)

  const arrayBuffer = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(arrayBuffer))

  return c.json({ path: filePath })
})

export default app
