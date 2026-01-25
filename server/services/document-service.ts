import { mkdir, readFile, writeFile, unlink, rename } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { getSettings } from '../lib/settings'
import { log } from '../lib/logger'

/**
 * Get the documents directory path from settings
 */
export function getDocumentsDir(): string {
  return getSettings().assistant.documentsDir
}

/**
 * Ensure the documents directory exists
 */
export async function ensureDocumentsDir(): Promise<void> {
  const dir = getDocumentsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
    log.assistant.info('Created documents directory', { path: dir })
  }
}

/**
 * Save a document to the filesystem
 * @param filename - The filename (relative to documents dir)
 * @param content - The document content
 * @returns The filename
 */
export async function saveDocument(filename: string, content: string): Promise<string> {
  await ensureDocumentsDir()
  const filepath = path.join(getDocumentsDir(), filename)
  await writeFile(filepath, content, 'utf-8')
  log.assistant.debug('Saved document', { filename, size: content.length })
  return filename
}

/**
 * Read a document from the filesystem
 * @param filename - The filename (relative to documents dir)
 * @returns The document content or null if not found
 */
export async function readDocument(filename: string): Promise<string | null> {
  const filepath = path.join(getDocumentsDir(), filename)
  if (!existsSync(filepath)) {
    return null
  }
  return readFile(filepath, 'utf-8')
}

/**
 * Rename a document
 * @param oldName - Current filename
 * @param newName - New filename
 * @returns The new filename
 */
export async function renameDocument(oldName: string, newName: string): Promise<string> {
  const dir = getDocumentsDir()
  const oldPath = path.join(dir, oldName)
  const newPath = path.join(dir, newName)

  if (!existsSync(oldPath)) {
    throw new Error(`Document not found: ${oldName}`)
  }

  if (existsSync(newPath)) {
    throw new Error(`Document already exists: ${newName}`)
  }

  await rename(oldPath, newPath)
  log.assistant.info('Renamed document', { from: oldName, to: newName })
  return newName
}

/**
 * Delete a document from the filesystem
 * @param filename - The filename to delete
 */
export async function deleteDocument(filename: string): Promise<void> {
  const filepath = path.join(getDocumentsDir(), filename)
  if (existsSync(filepath)) {
    await unlink(filepath)
    log.assistant.info('Deleted document', { filename })
  }
}

/**
 * Generate a document filename from a title
 * Creates a safe filename with a unique suffix
 * @param title - The document title
 * @returns A safe filename like "my-report-k8f3x2.md"
 */
export function generateDocumentFilename(title: string): string {
  // Sanitize title for filename
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'document'

  // Add unique suffix using base36 timestamp
  const suffix = Date.now().toString(36)
  return `${sanitized}-${suffix}.md`
}

/**
 * Check if a document exists
 * @param filename - The filename to check
 * @returns true if the document exists
 */
export function documentExists(filename: string): boolean {
  const filepath = path.join(getDocumentsDir(), filename)
  return existsSync(filepath)
}
