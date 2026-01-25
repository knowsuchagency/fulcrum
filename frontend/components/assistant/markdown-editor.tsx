import { useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { cn } from '@/lib/utils'

interface MarkdownEditorProps {
  content?: string
  onChange?: (content: string) => void
  className?: string
  placeholder?: string
}

/**
 * Rich markdown editor for document authoring
 * This is a controlled component - parent owns the state
 */
export function MarkdownEditor({
  content = '',
  onChange,
  className,
  placeholder = 'Start writing...',
}: MarkdownEditorProps) {
  const handleChange = useCallback(
    (value?: string) => {
      onChange?.(value || '')
    },
    [onChange]
  )

  return (
    <div className={cn('h-full', className)} data-color-mode="dark">
      <MDEditor
        value={content}
        onChange={handleChange}
        height="100%"
        visibleDragbar={false}
        preview="live"
        textareaProps={{
          placeholder,
        }}
        className="!border-0 !bg-transparent"
      />
    </div>
  )
}
