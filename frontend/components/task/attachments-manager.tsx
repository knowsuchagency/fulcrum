import { useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  File02Icon,
  Image02Icon,
  Pdf01Icon,
  Delete02Icon,
  Download02Icon,
  Upload02Icon,
} from '@hugeicons/core-free-icons'
import {
  useTaskAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  getAttachmentDownloadUrl,
} from '@/hooks/use-task-attachments'
import type { TaskAttachment } from '@shared/types'
import { cn } from '@/lib/utils'

interface AttachmentsManagerProps {
  taskId: string
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return Pdf01Icon
  }
  if (mimeType.startsWith('image/')) {
    return Image02Icon
  }
  // All other file types use the generic file icon
  return File02Icon
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentsManager({ taskId }: AttachmentsManagerProps) {
  const { data: attachments = [], isLoading } = useTaskAttachments(taskId)
  const uploadMutation = useUploadAttachment()
  const deleteMutation = useDeleteAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      setUploadError(null)

      for (const file of Array.from(files)) {
        try {
          await uploadMutation.mutateAsync({ taskId, file })
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed')
        }
      }
    },
    [taskId, uploadMutation]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  const handleDelete = async (attachment: TaskAttachment) => {
    try {
      await deleteMutation.mutateAsync({ taskId, attachmentId: attachment.id })
    } catch {
      // Error is handled by mutation
    }
  }

  const handleDownload = (attachment: TaskAttachment) => {
    const url = getAttachmentDownloadUrl(taskId, attachment.id)
    window.open(url, '_blank')
  }

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Loading attachments...</div>
  }

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.doc,.docx,.xls,.xlsx,.csv"
        />
        <HugeiconsIcon icon={Upload02Icon} size={20} className="mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">
          {uploadMutation.isPending ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          PDF, images, documents, spreadsheets (max 50MB)
        </p>
      </div>

      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((attachment) => {
            const FileIcon = getFileIcon(attachment.mimeType)
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-2 p-2 rounded border bg-card hover:bg-accent/50 transition-colors group"
              >
                <HugeiconsIcon icon={FileIcon} size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{attachment.filename}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleDownload(attachment)}
                    title="Download"
                  >
                    <HugeiconsIcon icon={Download02Icon} size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(attachment)}
                    disabled={deleteMutation.isPending}
                    title="Delete"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {attachments.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground italic">No attachments</p>
      )}
    </div>
  )
}
