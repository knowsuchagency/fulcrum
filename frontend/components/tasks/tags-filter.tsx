import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Tag01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { useTags } from '@/hooks/use-tags'
import { cn } from '@/lib/utils'

interface TagsFilterProps {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagsFilter({ value, onChange }: TagsFilterProps) {
  const { t } = useTranslation('tasks')
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: allTags = [] } = useTags()

  // Filter tags by search query
  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const toggleTag = (tagName: string) => {
    if (value.includes(tagName)) {
      onChange(value.filter((t) => t !== tagName))
    } else {
      onChange([...value, tagName])
    }
  }

  const removeTag = (tagName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter((t) => t !== tagName))
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'shrink-0 gap-1.5 h-7 px-2',
              value.length > 0 && 'pr-1'
            )}
          />
        }
      >
        <HugeiconsIcon icon={Tag01Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
        {value.length === 0 ? (
          <>
            <span className="text-xs">{t('allTags')}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="text-muted-foreground" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {value.slice(0, 2).map((tagName) => (
                <Badge
                  key={tagName}
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] gap-0.5"
                >
                  {tagName}
                  <button
                    onClick={(e) => removeTag(tagName, e)}
                    className="hover:text-destructive transition-colors"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={10} />
                  </button>
                </Badge>
              ))}
              {value.length > 2 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  +{value.length - 2}
                </Badge>
              )}
            </div>
            <button
              onClick={clearAll}
              className="ml-0.5 p-0.5 hover:text-destructive transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchTags')}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-48 overflow-y-auto py-1">
          {filteredTags.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
              {t('noTagsFound')}
            </div>
          ) : (
            filteredTags.map((tag) => {
              const isSelected = value.includes(tag.name)
              return (
                <button
                  key={tag.id}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2',
                    isSelected && 'bg-accent/50'
                  )}
                  onClick={() => toggleTag(tag.name)}
                >
                  <Checkbox
                    checked={isSelected}
                    className="pointer-events-none"
                  />
                  <span className="flex-1 truncate">{tag.name}</span>
                  <span className="text-muted-foreground text-[10px]">
                    {tag.taskCount}
                  </span>
                </button>
              )
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onChange([])
                setOpen(false)
              }}
            >
              {t('clearTags')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
