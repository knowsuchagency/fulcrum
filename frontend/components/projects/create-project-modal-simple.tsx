import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCreateProject } from '@/hooks/use-projects'
import { useSearchTags } from '@/hooks/use-tags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Alert02Icon,
  Cancel01Icon,
  Add01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { TagWithUsage } from '@shared/types'

interface CreateProjectModalSimpleProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectModalSimple({
  open,
  onOpenChange,
}: CreateProjectModalSimpleProps) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const createProject = useCreateProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tagContainerRef = useRef<HTMLDivElement>(null)

  // Search for existing tags
  const { data: searchResults = [] } = useSearchTags(tagInput)

  // Filter out already added tags
  const availableTags = searchResults.filter(
    (result) => !tags.includes(result.name)
  )

  // Check for exact match
  const exactMatch = searchResults.find(
    (t) => t.name.toLowerCase() === tagInput.toLowerCase()
  )
  const showCreateOption = tagInput.trim() && !exactMatch && !tags.includes(tagInput.trim())

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setTags([])
      setTagInput('')
      setError(null)
      setShowTagDropdown(false)
    }
  }, [open])

  // Close tag dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagContainerRef.current && !tagContainerRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAddTag = (tagName: string) => {
    const trimmed = tagName.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setTagInput('')
    setShowTagDropdown(false)
  }

  const handleRemoveTag = (tagName: string) => {
    setTags(tags.filter((t) => t !== tagName))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      if (exactMatch && !tags.includes(exactMatch.name)) {
        handleAddTag(exactMatch.name)
      } else if (showCreateOption) {
        handleAddTag(tagInput.trim())
      }
    } else if (e.key === 'Escape') {
      setShowTagDropdown(false)
      setTagInput('')
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      setTags(tags.slice(0, -1))
    }
  }

  const handleCreate = async () => {
    setError(null)
    const trimmedName = name.trim()
    if (!trimmedName) return

    try {
      const project = await createProject.mutateAsync({
        name: trimmedName,
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      })

      onOpenChange(false)
      navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && name.trim()) {
      e.preventDefault()
      handleCreate()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('newProjectButton')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('newProject.projectName')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('newProject.projectNamePlaceholder')}
              disabled={createProject.isPending}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="project-description">
              {t('newProject.description')}
            </Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('newProject.descriptionPlaceholder')}
              disabled={createProject.isPending}
              rows={3}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2" ref={tagContainerRef}>
            <Label>Tags</Label>

            {/* Current tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="default" className="pr-1 gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-0.5 hover:text-destructive transition-colors"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag input */}
            <div className="relative">
              <Input
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value)
                  setShowTagDropdown(true)
                }}
                onFocus={() => setShowTagDropdown(true)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add tags..."
                disabled={createProject.isPending}
              />

              {/* Tag dropdown */}
              {showTagDropdown && (tagInput || availableTags.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                  {availableTags.map((tag: TagWithUsage) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between"
                      onClick={() => handleAddTag(tag.name)}
                    >
                      <span>{tag.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {tag.taskCount + tag.projectCount} uses
                      </span>
                    </button>
                  ))}
                  {showCreateOption && (
                    <button
                      type="button"
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2',
                        availableTags.length > 0 && 'border-t'
                      )}
                      onClick={() => handleAddTag(tagInput.trim())}
                    >
                      <HugeiconsIcon icon={Add01Icon} size={14} />
                      <span>Create "{tagInput.trim()}"</span>
                    </button>
                  )}
                  {!showCreateOption && availableTags.length === 0 && tagInput && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No matching tags
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={14}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
              />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createProject.isPending}
          >
            {t('newProject.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createProject.isPending}
          >
            {createProject.isPending ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  strokeWidth={2}
                  className="animate-spin"
                />
                {t('newProject.creating')}
              </>
            ) : (
              t('newProject.create')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
