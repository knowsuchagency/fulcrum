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
            ? isDark ? 'bg-zinc-700 border border-zinc-600' : 'bg-zinc-200 border border-zinc-300'
            : isDark
              ? 'bg-gradient-to-br from-destructive/30 to-destructive/20 border border-destructive/40'
              : 'bg-gradient-to-br from-accent/30 to-accent/20 border border-accent/40'
        }`}
        style={
          !isUser
            ? {
                boxShadow: isDark
                  ? '0 0 10px color-mix(in oklch, var(--destructive) 30%, transparent), 0 0 20px color-mix(in oklch, var(--destructive) 15%, transparent)'
                  : '0 0 10px color-mix(in oklch, var(--accent) 30%, transparent), 0 0 20px color-mix(in oklch, var(--accent) 15%, transparent)',
              }
            : undefined
        }
      >
        {isUser ? (
          <User className={`w-4 h-4 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`} />
        ) : (
          <Bot className={`w-4 h-4 ${isDark ? 'text-destructive' : 'text-accent'}`} />
        )}
      </div>

      {/* Message content */}
      <div
        onClick={isClickable ? onClick : undefined}
        className={`flex-1 min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm overflow-hidden ${
          isUser
            ? isDark
              ? 'bg-zinc-700/50 border border-zinc-600/50 text-zinc-100 rounded-tr-sm'
              : 'bg-zinc-100 border border-zinc-200 text-zinc-800 rounded-tr-sm'
            : isDark
              ? 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-200 rounded-tl-sm'
              : 'bg-white border border-zinc-200 text-zinc-700 rounded-tl-sm'
        } ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ' + (isDark ? 'hover:ring-destructive/40 hover:ring-offset-zinc-900' : 'hover:ring-accent/40 hover:ring-offset-white') : ''}`}
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
                color: isDark ? '#e4e4e7' : '#3f3f46',
              }}
              components={components}
              className={`prose-sm max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto ${
                isDark
                  ? '[&_pre]:bg-zinc-900/50 [&_pre]:border [&_pre]:border-zinc-700/50 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-destructive [&_a]:text-destructive [&_a:hover]:text-destructive/80 [&_strong]:text-zinc-100 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-100 [&_h4]:text-zinc-100 [&_li]:text-zinc-200 [&_table]:border-zinc-700 [&_th]:bg-zinc-800 [&_th]:border-zinc-700 [&_td]:border-zinc-700'
                  : '[&_pre]:bg-zinc-100 [&_pre]:border [&_pre]:border-zinc-200 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-accent [&_a]:text-accent [&_a:hover]:text-accent/80 [&_strong]:text-zinc-800 [&_h1]:text-zinc-800 [&_h2]:text-zinc-800 [&_h3]:text-zinc-800 [&_h4]:text-zinc-800 [&_li]:text-zinc-700 [&_table]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:border-zinc-200 [&_td]:border-zinc-200'
              }`}
            />
          </div>
        ) : isStreaming ? (
          <span className={`inline-flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-destructive' : 'bg-accent'}`}
                style={{ animationDelay: '0ms' }}
              />
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-destructive' : 'bg-accent'}`}
                style={{ animationDelay: '150ms' }}
              />
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-destructive' : 'bg-accent'}`}
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
