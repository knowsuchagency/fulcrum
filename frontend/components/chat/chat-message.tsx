import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { Bot, User } from 'lucide-react'
import { useTheme } from 'next-themes'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user'
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

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
              ? 'bg-gradient-to-br from-red-500/30 to-orange-500/30 border border-red-500/40'
              : 'bg-gradient-to-br from-teal-500/30 to-teal-400/30 border border-teal-500/40'
        }`}
        style={
          !isUser
            ? {
                boxShadow: isDark
                  ? '0 0 10px rgba(239, 68, 68, 0.4), 0 0 20px rgba(234, 88, 12, 0.2)'
                  : '0 0 10px rgba(13, 92, 99, 0.3), 0 0 20px rgba(11, 122, 117, 0.15)',
              }
            : undefined
        }
      >
        {isUser ? (
          <User className={`w-4 h-4 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`} />
        ) : (
          <Bot className={`w-4 h-4 ${isDark ? 'text-red-300' : 'text-teal-600'}`} />
        )}
      </div>

      {/* Message content */}
      <div
        className={`flex-1 min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm overflow-hidden ${
          isUser
            ? isDark
              ? 'bg-zinc-700/50 border border-zinc-600/50 text-zinc-100 rounded-tr-sm'
              : 'bg-zinc-100 border border-zinc-200 text-zinc-800 rounded-tr-sm'
            : isDark
              ? 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-200 rounded-tl-sm'
              : 'bg-white border border-zinc-200 text-zinc-700 rounded-tl-sm'
        }`}
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
                  ? '[&_pre]:bg-zinc-900/50 [&_pre]:border [&_pre]:border-zinc-700/50 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-red-300 [&_a]:text-red-400 [&_a:hover]:text-red-300 [&_strong]:text-zinc-100 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-100 [&_h4]:text-zinc-100 [&_li]:text-zinc-200 [&_table]:border-zinc-700 [&_th]:bg-zinc-800 [&_th]:border-zinc-700 [&_td]:border-zinc-700'
                  : '[&_pre]:bg-zinc-100 [&_pre]:border [&_pre]:border-zinc-200 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-teal-700 [&_a]:text-teal-600 [&_a:hover]:text-teal-700 [&_strong]:text-zinc-800 [&_h1]:text-zinc-800 [&_h2]:text-zinc-800 [&_h3]:text-zinc-800 [&_h4]:text-zinc-800 [&_li]:text-zinc-700 [&_table]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:border-zinc-200 [&_td]:border-zinc-200'
              }`}
            />
          </div>
        ) : isStreaming ? (
          <span className={`inline-flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-red-400' : 'bg-teal-500'}`}
                style={{ animationDelay: '0ms' }}
              />
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-red-400' : 'bg-teal-500'}`}
                style={{ animationDelay: '150ms' }}
              />
              <span
                className={`w-1 h-1 rounded-full animate-bounce ${isDark ? 'bg-red-400' : 'bg-teal-500'}`}
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
