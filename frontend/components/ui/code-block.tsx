import { useEffect, useState } from 'react'
import { highlightCode, type ShikiTheme } from '@/lib/shiki'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language: string
  className?: string
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false
    const theme: ShikiTheme = resolvedTheme === 'light' ? 'light' : 'dark'

    highlightCode(code, language, theme).then((result) => {
      if (!cancelled) {
        setHtml(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language, resolvedTheme])

  if (!html) {
    // Fallback while loading
    return (
      <pre className={cn('rounded-lg border bg-muted p-4 text-xs font-mono overflow-auto', className)}>
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border overflow-auto [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:text-xs [&_pre]:m-0 [&_code]:text-xs',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
