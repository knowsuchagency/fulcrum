import MarkdownPreview from '@uiw/react-markdown-preview'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { MDXRenderer, extractChartBlocks } from './mdx-renderer'

interface ContentRendererProps {
  content: string
  className?: string
  /** If provided, treat the entire content as this type (used for artifact content) */
  contentType?: 'chart' | 'mermaid' | 'markdown' | 'code' | null
}

/**
 * Render markdown + MDX chart content
 * Parses content for ```chart blocks and renders them with Recharts via MDX
 */
export function ContentRenderer({ content, className, contentType }: ContentRendererProps) {
  const { resolvedTheme } = useTheme()
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light'

  // If contentType is specified, treat the entire content as that type
  // This is used for artifact content which is stored without markdown wrappers
  if (contentType === 'chart') {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="my-4 bg-card rounded-lg border border-border overflow-hidden p-4">
          <MDXRenderer source={content} />
        </div>
      </div>
    )
  }

  if (contentType === 'markdown' || contentType === 'code') {
    return (
      <div className={cn('space-y-4', className)}>
        <MarkdownPreview
          source={contentType === 'code' ? `\`\`\`\n${content}\n\`\`\`` : content}
          className="!bg-transparent prose prose-sm dark:prose-invert max-w-none"
          wrapperElement={{
            'data-color-mode': colorMode,
          }}
        />
      </div>
    )
  }

  // Otherwise, parse the content to extract chart blocks from markdown
  const blocks = extractChartBlocks(content)

  if (blocks.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'chart') {
          return (
            <div key={index} className="my-4 bg-card rounded-lg border border-border overflow-hidden p-4">
              <MDXRenderer source={block.content} />
            </div>
          )
        }

        return (
          <MarkdownPreview
            key={index}
            source={block.content}
            className="!bg-transparent prose prose-sm dark:prose-invert max-w-none"
            wrapperElement={{
              'data-color-mode': colorMode,
            }}
          />
        )
      })}
    </div>
  )
}
