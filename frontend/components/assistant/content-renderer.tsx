import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { cn } from '@/lib/utils'

interface ContentRendererProps {
  content: string
  className?: string
  /** If provided, treat the entire content as this type (used for artifact content) */
  contentType?: 'vega-lite' | 'mermaid' | 'markdown' | 'code' | null
}

interface ContentBlock {
  type: 'markdown' | 'vega-lite'
  content: string
}

/**
 * Parse content into blocks of markdown and vega-lite specs
 * Handles both triple backtick code blocks and raw JSON objects
 */
function parseContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []

  // More flexible regex: allows optional whitespace/newlines after vega-lite
  const vegaPattern = /```vega-lite\s*([\s\S]*?)```/g

  let lastIndex = 0
  let match

  while ((match = vegaPattern.exec(content)) !== null) {
    // Add markdown before this vega block
    if (match.index > lastIndex) {
      const markdown = content.slice(lastIndex, match.index).trim()
      if (markdown) {
        blocks.push({ type: 'markdown', content: markdown })
      }
    }

    // Add the vega-lite block
    const specContent = match[1].trim()
    if (specContent) {
      blocks.push({ type: 'vega-lite', content: specContent })
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining markdown after last vega block
  if (lastIndex < content.length) {
    const markdown = content.slice(lastIndex).trim()
    if (markdown) {
      // Check if the remaining content looks like a raw JSON Vega spec
      // (sometimes the AI outputs JSON without proper code blocks)
      if (markdown.startsWith('{') && markdown.includes('"$schema"') && markdown.includes('vega')) {
        blocks.push({ type: 'vega-lite', content: markdown })
      } else {
        blocks.push({ type: 'markdown', content: markdown })
      }
    }
  }

  return blocks
}

/**
 * Render a Vega-Lite chart
 */
function VegaLiteChart({ spec }: { spec: string }) {
  const parsedSpec = useMemo(() => {
    try {
      const parsed = JSON.parse(spec) as VisualizationSpec
      return parsed
    } catch (e) {
      console.error('Failed to parse Vega-Lite spec:', e)
      return null
    }
  }, [spec])

  if (!parsedSpec) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
        <p className="font-medium">Invalid Vega-Lite specification</p>
        <pre className="mt-2 text-xs overflow-auto max-h-32">{spec.slice(0, 200)}...</pre>
      </div>
    )
  }

  return (
    <div className="my-4 bg-card rounded-lg border border-border overflow-hidden">
      <VegaEmbed
        spec={parsedSpec}
        options={{
          actions: false,
          renderer: 'svg',
          theme: 'dark',
        }}
        onError={(error) => console.error('Vega-Embed error:', error)}
      />
    </div>
  )
}

/**
 * Render markdown + vega-lite content
 */
export function ContentRenderer({ content, className, contentType }: ContentRendererProps) {
  // If contentType is specified, treat the entire content as that type
  // This is used for artifact content which is stored without markdown wrappers
  if (contentType === 'vega-lite') {
    return (
      <div className={cn('space-y-4', className)}>
        <VegaLiteChart spec={content} />
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
            'data-color-mode': 'dark',
          }}
        />
      </div>
    )
  }

  // Otherwise, parse the content to extract vega-lite blocks from markdown
  const blocks = parseContent(content)

  if (blocks.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'vega-lite') {
          return <VegaLiteChart key={index} spec={block.content} />
        }

        return (
          <MarkdownPreview
            key={index}
            source={block.content}
            className="!bg-transparent prose prose-sm dark:prose-invert max-w-none"
            wrapperElement={{
              'data-color-mode': 'dark',
            }}
          />
        )
      })}
    </div>
  )
}
