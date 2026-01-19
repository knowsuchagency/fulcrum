import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Add01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { useSearchTags, useAddProjectTag, useRemoveProjectTag } from '@/hooks/use-tags'
import type { Tag, TagWithUsage } from '@shared/types'
import { cn } from '@/lib/utils'

interface ProjectTagsManagerProps {
  projectId: string
  tags: Tag[]
}

export function ProjectTagsManager({ projectId, tags }: ProjectTagsManagerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: searchResults = [] } = useSearchTags(searchQuery)
  const addTagMutation = useAddProjectTag()
  const removeTagMutation = useRemoveProjectTag()

  // Filter out already added tags
  const availableTags = searchResults.filter(
    (result) => !tags.some((t) => t.id === result.id)
  )

  // Check if search query matches an existing tag name exactly
  const exactMatch = searchResults.find(
    (t) => t.name.toLowerCase() === searchQuery.toLowerCase()
  )
  const showCreateOption = searchQuery.trim() && !exactMatch

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAddTag = async (tagOrName: TagWithUsage | string) => {
    try {
      if (typeof tagOrName === 'string') {
        // Create new tag
        await addTagMutation.mutateAsync({ projectId, name: tagOrName })
      } else {
        // Add existing tag
        await addTagMutation.mutateAsync({ projectId, tagId: tagOrName.id })
      }
      setSearchQuery('')
      setShowDropdown(false)
    } catch {
      // Error handled by mutation
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    try {
      await removeTagMutation.mutateAsync({ projectId, tagId })
    } catch {
      // Error handled by mutation
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault()
      if (exactMatch && !tags.some((t) => t.id === exactMatch.id)) {
        handleAddTag(exactMatch)
      } else if (showCreateOption) {
        handleAddTag(searchQuery.trim())
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setSearchQuery('')
    }
  }

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setIsEditing(true)
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
          >
            Edit
          </Button>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="default">
                {tag.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No tags</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => {
            setIsEditing(false)
            setSearchQuery('')
            setShowDropdown(false)
          }}
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} data-slot="icon" />
          Done
        </Button>
      </div>

      {/* Current tags with remove buttons */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag.id} variant="default" className="pr-1 gap-1">
              {tag.name}
              <button
                onClick={() => handleRemoveTag(tag.id)}
                className="ml-0.5 hover:text-destructive transition-colors"
                disabled={removeTagMutation.isPending}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search/add input */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create tag..."
          className="h-8 text-sm"
        />

        {/* Dropdown */}
        {showDropdown && (searchQuery || availableTags.length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between"
                onClick={() => handleAddTag(tag)}
              >
                <span>{tag.name}</span>
                <span className="text-xs text-muted-foreground">
                  {tag.taskCount + tag.projectCount} uses
                </span>
              </button>
            ))}
            {showCreateOption && (
              <button
                className={cn(
                  'w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2',
                  availableTags.length > 0 && 'border-t'
                )}
                onClick={() => handleAddTag(searchQuery.trim())}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                <span>Create "{searchQuery.trim()}"</span>
              </button>
            )}
            {!showCreateOption && availableTags.length === 0 && searchQuery && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No matching tags
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
