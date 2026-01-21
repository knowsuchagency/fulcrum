import { useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  useProjectAttachments,
  useUploadProjectAttachment,
  useDeleteProjectAttachment,
  getProjectAttachmentDownloadUrl,
} from '@/hooks/use-project-attachments'
import type { ProjectAttachment } from '@shared/types'
import { cn } from '@/lib/utils'

interface ProjectAttachmentsManagerProps {
  projectId: string
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return Pdf01Icon
  }
  if (mimeType.startsWith('image/')) {
    return Image02Icon
  }
  return File02Icon
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ProjectAttachmentsManager({ projectId }: ProjectAttachmentsManagerProps) {
  const { t } = useTranslation('projects')
  const { data: attachments = [], isLoading } = useProjectAttachments(projectId)
  const uploadMutation = useUploadProjectAttachment()
  const deleteMutation = useDeleteProjectAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      setUploadError(null)

      for (const file of Array.from(files)) {
        try {
          await uploadMutation.mutateAsync({ projectId, file })
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed')
        }
      }
    },
    [projectId, uploadMutation]
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

  const handleDelete = async (attachment: ProjectAttachment) => {
    try {
      await deleteMutation.mutateAsync({ projectId, attachmentId: attachment.id })
    } catch {
      // Error is handled by mutation
    }
  }

  const handleDownload = (attachment: ProjectAttachment) => {
    const url = getProjectAttachmentDownloadUrl(projectId, attachment.id)
    window.open(url, '_blank')
  }

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">{t('detail.loadingAttachments')}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t('detail.sections.attachments')}
        </h3>
      </div>

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
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.doc,.docx,.xls,.xlsx,.json,.zip,.gz,.tar"
        />
        <HugeiconsIcon icon={Upload02Icon} size={20} className="mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">
          {uploadMutation.isPending ? t('detail.uploading') : t('detail.dropOrClick')}
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          {t('detail.attachmentTypes')}
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
        <p className="text-xs text-muted-foreground italic">{t('detail.noAttachments')}</p>
      )}
    </div>
  )
}
