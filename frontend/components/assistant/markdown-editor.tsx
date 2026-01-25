import { useState, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { cn } from '@/lib/utils'

interface MarkdownEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  className?: string
  placeholder?: string
}

/**
 * Rich markdown editor for document authoring
 */
export function MarkdownEditor({
  initialContent = '',
  onChange,
  className,
  placeholder = 'Start writing...',
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent)

  const handleChange = useCallback(
    (value?: string) => {
      const newContent = value || ''
      setContent(newContent)
      onChange?.(newContent)
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
