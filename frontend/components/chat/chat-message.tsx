import { useMemo } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { Bot, User } from 'lucide-react'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
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
    <div className={`flex gap-3 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser
              ? 'bg-zinc-700 border border-zinc-600'
              : 'bg-gradient-to-br from-violet-500/30 to-purple-500/30 border border-violet-500/40'
          }`}
          style={
            !isUser
              ? {
                  boxShadow:
                    '0 0 10px rgba(139, 92, 246, 0.4), 0 0 20px rgba(124, 58, 237, 0.2)',
                }
              : undefined
          }
        >
          {isUser ? (
            <User className="w-4 h-4 text-zinc-300" />
          ) : (
            <Bot className="w-4 h-4 text-violet-300" />
          )}
        </div>
        {/* Subtle glow ring for AI */}
        {!isUser && (
          <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-pulse" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`flex-1 max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-zinc-700/50 border border-zinc-600/50 text-zinc-100 rounded-tr-sm'
            : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-200 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : content ? (
          <div data-color-mode="dark">
            <MarkdownPreview
              source={content}
              style={{
                backgroundColor: 'transparent',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#e4e4e7',
              }}
              components={components}
              className="prose-sm max-w-none [&_pre]:bg-zinc-900/50 [&_pre]:border [&_pre]:border-zinc-700/50 [&_pre]:text-xs [&_code]:text-xs [&_code]:text-violet-300 [&_a]:text-violet-400 [&_a:hover]:text-violet-300 [&_strong]:text-zinc-100 [&_h1]:text-zinc-100 [&_h2]:text-zinc-100 [&_h3]:text-zinc-100 [&_h4]:text-zinc-100 [&_li]:text-zinc-200"
            />
          </div>
        ) : isStreaming ? (
          <span className="inline-flex items-center gap-1 text-zinc-400">
            <span className="animate-pulse">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span
                className="w-1 h-1 bg-violet-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1 h-1 bg-violet-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1 h-1 bg-violet-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
