import { useCallback, useRef, useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, TextIcon, SourceCodeIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useFilesStoreActions } from '@/stores'
import { MonacoEditor } from './monaco-editor'
import { MarkdownRenderer } from './markdown-renderer'

const AUTO_SAVE_DELAY = 1000 // 1 second debounce

export const FileContent = observer(function FileContent() {
  const {
    selectedFile,
    currentFile,
    isLoading,
    isSaving,
    loadError,
    isDirty,
    updateContent,
    saveFile,
    closeFile,
    toggleMarkdownView,
  } = useFilesStoreActions()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const handleContentChange = useCallback(
    (newValue: string) => {
      if (!selectedFile) return

      updateContent(selectedFile, newValue)

      // Clear existing timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }

      // Set new debounced save
      saveTimerRef.current = setTimeout(() => {
        saveFile(selectedFile).catch((err) => {
          console.error('Auto-save failed:', err)
        })
      }, AUTO_SAVE_DELAY)
    },
    [selectedFile, updateContent, saveFile]
  )

  const handleClose = useCallback(() => {
    if (selectedFile) {
      // Cancel pending save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      closeFile(selectedFile)
    }
  }, [selectedFile, closeFile])

  const handleToggleMarkdownView = useCallback(() => {
    if (selectedFile) {
      toggleMarkdownView(selectedFile)
    }
  }, [selectedFile, toggleMarkdownView])

  // No file selected
  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select a file to view
      </div>
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading file...
      </div>
    )
  }

  // Error
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-destructive text-sm">
        {loadError}
      </div>
    )
  }

  // No content
  if (!currentFile) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Unable to load file
      </div>
    )
  }

  // Binary file
  if (currentFile.isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground text-sm gap-2">
        <p>Binary file</p>
        <p className="text-xs">{(currentFile.size / 1024).toFixed(1)} KB</p>
      </div>
    )
  }

  // Image file
  if (currentFile.isImage) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <div className="flex shrink-0 items-center justify-between px-2 py-1.5 bg-card border-b border-border text-xs">
          <span className="text-muted-foreground truncate" title={selectedFile}>
            {selectedFile.split('/').pop() || selectedFile}
          </span>
          <button
            onClick={handleClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
            title="Close file"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 bg-muted">
          <img
            src={currentFile.content}
            alt={selectedFile}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    )
  }

  // Text/code file
  const fileName = selectedFile.split('/').pop() || selectedFile
  const isMarkdownFile = currentFile.isMarkdown
  const showMarkdownPreview = isMarkdownFile && currentFile.isMarkdownView

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 px-2 py-1.5 bg-card border-b border-border text-xs">
        <span
          className="text-muted-foreground truncate flex-1 flex items-center gap-1"
          title={selectedFile}
        >
          {fileName}
          {isDirty && <span className="text-amber-500">*</span>}
          {isSaving && (
            <span className="text-muted-foreground italic">(saving...)</span>
          )}
        </span>

        {currentFile.truncated && (
          <span className="text-destructive">
            Truncated ({currentFile.lineCount.toLocaleString()} lines)
          </span>
        )}

        <span className="text-muted-foreground">
          {(currentFile.size / 1024).toFixed(1)} KB
        </span>

        {/* Markdown toggle - only show for .md files */}
        {isMarkdownFile && (
          <button
            onClick={handleToggleMarkdownView}
            className={cn(
              'p-1 rounded hover:bg-muted/50 transition-colors',
              showMarkdownPreview
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={showMarkdownPreview ? 'Show code' : 'Preview markdown'}
          >
            <HugeiconsIcon
              icon={showMarkdownPreview ? SourceCodeIcon : TextIcon}
              size={14}
              strokeWidth={2}
            />
          </button>
        )}

        <button
          onClick={handleClose}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
          title="Close file"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0">
        {showMarkdownPreview ? (
          <MarkdownRenderer content={currentFile.content} />
        ) : (
          <MonacoEditor
            filePath={selectedFile}
            content={currentFile.content}
            onChange={handleContentChange}
            readOnly={!currentFile.isEditable}
          />
        )}
      </div>
    </div>
  )
})
