import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { Bot, User } from 'lucide-react'
import { useTheme } from 'next-themes'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  onClick?: () => void
}

export function ChatMessage({ role, content, isStreaming, onClick }: ChatMessageProps) {
  const isUser = role === 'user'
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isClickable = !isUser && content && onClick

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
    <div className={`flex gap-3 py-3 animate-in fade-in-0 duration-200 ${isUser ? 'flex-row-reverse slide-in-from-right-2' : 'flex-row slide-in-from-left-2'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-muted border border-border'
            : 'bg-gradient-to-br from-accent/30 to-accent/20 border border-accent/40'
        }`}
        style={
          !isUser
            ? {
                boxShadow: '0 0 10px color-mix(in oklch, var(--accent) 30%, transparent), 0 0 20px color-mix(in oklch, var(--accent) 15%, transparent)',
              }
            : undefined
        }
      >
        {isUser ? (
          <User className="w-4 h-4 text-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-accent" />
        )}
      </div>

      {/* Message content */}
      <div
        onClick={isClickable ? onClick : undefined}
        className={`flex-1 min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm overflow-hidden text-foreground ${
          isUser
            ? 'bg-muted/50 border border-border/50 rounded-tr-sm'
            : 'bg-card/50 border border-border/50 rounded-tl-sm'
        } ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all hover:ring-accent/40 hover:ring-offset-background' : ''}`}
        title={isClickable ? 'Click to expand' : undefined}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : content ? (
          <div data-color-mode={isDark ? 'dark' : 'light'}>
            <MarkdownPreview
              source={content}
              style={{
                backgroundColor: 'transparent',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-sans)',
              }}
              components={components}
              className="prose-sm max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-muted/50 [&_pre]:border [&_pre]:border-border/50 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-accent [&_a]:text-accent [&_a:hover]:text-accent/80 [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:text-foreground [&_table]:border-border [&_th]:bg-muted [&_th]:border-border [&_td]:border-border"
            />
          </div>
        ) : isStreaming ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span
                className="w-1 h-1 rounded-full animate-bounce bg-accent"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1 h-1 rounded-full animate-bounce bg-accent"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1 h-1 rounded-full animate-bounce bg-accent"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
