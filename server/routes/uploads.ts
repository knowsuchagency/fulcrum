import { Hono } from 'hono'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getViboraDir } from '../lib/settings'

const mimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

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
// Images are always saved to {viboraDir}/uploads/
app.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

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

  // Always save to {viboraDir}/uploads/
  const saveDir = join(getViboraDir(), 'uploads')

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

// GET /api/uploads/:filename
// Serve uploaded images for preview display
app.get('/:filename', async (c) => {
  const filename = c.req.param('filename')

  // Security: only allow expected filenames (clipboard-YYYY-MM-DD-HHMMSS.ext)
  if (!/^clipboard-\d{4}-\d{2}-\d{2}-\d{6}\.\w+$/.test(filename)) {
    return c.notFound()
  }

  const filePath = join(getViboraDir(), 'uploads', filename)

  if (!existsSync(filePath)) {
    return c.notFound()
  }

  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  const content = await readFile(filePath)
  return new Response(content, {
    headers: { 'Content-Type': contentType },
  })
})

export default app
