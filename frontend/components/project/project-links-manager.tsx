import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Link01Icon,
  Add01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { useAddProjectLink, useRemoveProjectLink } from '@/hooks/use-projects'
import { openExternalUrl } from '@/lib/editor-url'
import { toast } from 'sonner'
import type { ProjectLink } from '@/types'

interface ProjectLinksManagerProps {
  projectId: string
  links: ProjectLink[]
}

export function ProjectLinksManager({ projectId, links }: ProjectLinksManagerProps) {
  const { t } = useTranslation('projects')
  const [isAdding, setIsAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const addLink = useAddProjectLink()
  const removeLink = useRemoveProjectLink()

  const handleAddLink = () => {
    const trimmedUrl = newUrl.trim()
    if (!trimmedUrl) return

    // Validate URL format
    try {
      new URL(trimmedUrl)
    } catch {
      toast.error(t('detail.errors.invalidUrl', { defaultValue: 'Invalid URL' }), {
        description: t('detail.errors.invalidUrlDescription', { defaultValue: 'Please enter a valid URL including the scheme (e.g., https://)' }),
      })
      return
    }

    addLink.mutate(
      {
        projectId,
        url: trimmedUrl,
        label: newLabel.trim() || undefined,
      },
      {
        onSuccess: () => {
          setNewUrl('')
          setNewLabel('')
          setIsAdding(false)
        },
      }
    )
  }

  const handleRemoveLink = (linkId: string) => {
    removeLink.mutate({ projectId, linkId })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddLink()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewUrl('')
      setNewLabel('')
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('detail.sections.links')}</h3>

      {/* Existing links */}
      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-2 group"
            >
              <button
                type="button"
                onClick={() => openExternalUrl(link.url)}
                className="flex items-center gap-2 text-sm text-primary hover:underline flex-1 min-w-0"
              >
                <HugeiconsIcon icon={Link01Icon} size={14} className="shrink-0" />
                <span className="truncate">{link.label || link.url}</span>
              </button>
              <button
                type="button"
                onClick={() => handleRemoveLink(link.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                title={t('detail.removeLink')}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add link form */}
      {isAdding ? (
        <div className="space-y-2 pt-1">
          <Input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('detail.urlPlaceholder')}
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('detail.linkLabelPlaceholder')}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7"
              onClick={handleAddLink}
              disabled={!newUrl.trim() || addLink.isPending}
            >
              {t('detail.add')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                setIsAdding(false)
                setNewUrl('')
                setNewLabel('')
              }}
            >
              {t('detail.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} />
          <span>{t('detail.addLink')}</span>
        </button>
      )}
    </div>
  )
}
