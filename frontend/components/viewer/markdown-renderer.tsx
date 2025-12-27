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
 * Get the image src URL, transforming local paths to use the image API
 */
function getImageSrc(src: string, worktreePath: string, filePath: string): string {
  // Skip external URLs, data URIs, and already-transformed URLs
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('/api/')
  ) {
    return src
  }

  const resolvedPath = resolveImagePath(src, filePath)
  const params = new URLSearchParams({
    path: resolvedPath,
    root: worktreePath,
  })
  return `/api/fs/image?${params}`
}

export function MarkdownRenderer({ content, worktreePath, filePath }: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme()

  // Memoize custom components
  const components = useMemo(
    () => ({
      img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
        if (!src) return null
        const imageSrc = getImageSrc(src, worktreePath, filePath)
        return (
          <img
            src={imageSrc}
            alt={alt || ''}
            loading="lazy"
            style={{ maxWidth: '100%' }}
            {...props}
          />
        )
      },
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
    }),
    [worktreePath, filePath]
  )

  return (
    <ScrollArea className="h-full">
      <div className="p-4" data-color-mode={resolvedTheme === 'light' ? 'light' : 'dark'}>
        <MarkdownPreview
          source={content}
          style={{
            backgroundColor: 'transparent',
            fontSize: '14px',
          }}
          components={components}
        />
      </div>
    </ScrollArea>
  )
}
