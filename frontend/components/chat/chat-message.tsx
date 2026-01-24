import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiBrain01Icon, UserIcon } from '@hugeicons/core-free-icons'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const { resolvedTheme } = useTheme()
  const isUser = role === 'user'

  // Custom components for markdown
  const components = useMemo(
    () => ({
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
    }),
    []
  )

  return (
    <div
      className={cn(
        'flex gap-2 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 size-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <HugeiconsIcon
          icon={isUser ? UserIcon : AiBrain01Icon}
          className="size-4"
        />
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex-1 max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-none'
            : 'bg-muted text-foreground rounded-tl-none'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : content ? (
          <div data-color-mode={resolvedTheme === 'light' ? 'light' : 'dark'}>
            <MarkdownPreview
              source={content}
              style={{
                backgroundColor: 'transparent',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
              components={components}
              className="prose-sm max-w-none [&_pre]:bg-background/50 [&_pre]:text-xs [&_code]:text-xs"
            />
          </div>
        ) : isStreaming ? (
          <span className="inline-flex items-center gap-1">
            <span className="animate-pulse">Thinking</span>
            <span className="animate-bounce delay-75">.</span>
            <span className="animate-bounce delay-150">.</span>
            <span className="animate-bounce delay-300">.</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
