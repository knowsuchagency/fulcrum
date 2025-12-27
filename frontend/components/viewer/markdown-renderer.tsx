import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { useTheme } from 'next-themes'
import { ScrollArea } from '@/components/ui/scroll-area'

interface MarkdownRendererProps {
  content: string
  worktreePath: string
  filePath: string
}

/**
 * Resolve a relative image path to an absolute path based on the markdown file location
 */
function resolveImagePath(src: string, filePath: string): string {
  // Already absolute or external URL
  if (src.startsWith('/') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }

  // Get the directory of the markdown file
  const fileDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : ''

  // Resolve relative path
  const parts = fileDir ? fileDir.split('/') : []
  const srcParts = src.split('/')

  for (const part of srcParts) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '.') {
      parts.push(part)
    }
  }

  return parts.join('/')
}

/**
 * Transform image URLs in markdown content to use the local image API
 */
function transformImageUrls(content: string, worktreePath: string, filePath: string): string {
  // Match markdown image syntax: ![alt](src)
  return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    // Skip external URLs and data URIs
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return match
    }

    const resolvedPath = resolveImagePath(src, filePath)
    const params = new URLSearchParams({
      path: resolvedPath,
      root: worktreePath,
    })
    return `![${alt}](/api/fs/image?${params})`
  })
}

export function MarkdownRenderer({ content, worktreePath, filePath }: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme()

  // Transform image URLs to use local API
  const transformedContent = useMemo(
    () => transformImageUrls(content, worktreePath, filePath),
    [content, worktreePath, filePath]
  )

  return (
    <ScrollArea className="h-full">
      <div className="p-4" data-color-mode={resolvedTheme === 'light' ? 'light' : 'dark'}>
        <MarkdownPreview
          source={transformedContent}
          style={{
            backgroundColor: 'transparent',
            fontSize: '14px',
          }}
          rehypeRewrite={(node) => {
            if (node.type !== 'element') return

            // Open links in new tab
            if (node.tagName === 'a') {
              node.properties = {
                ...node.properties,
                target: '_blank',
                rel: 'noopener noreferrer',
              }
            }

            // Transform image src to use local API
            if (node.tagName === 'img' && node.properties?.src) {
              const src = String(node.properties.src)
              // Skip external URLs, data URIs, and already-transformed URLs
              if (
                !src.startsWith('http://') &&
                !src.startsWith('https://') &&
                !src.startsWith('data:') &&
                !src.startsWith('/api/')
              ) {
                const resolvedPath = resolveImagePath(src, filePath)
                const params = new URLSearchParams({
                  path: resolvedPath,
                  root: worktreePath,
                })
                node.properties.src = `/api/fs/image?${params}`
              }
            }
          }}
        />
      </div>
    </ScrollArea>
  )
}
