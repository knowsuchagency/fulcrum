import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit02Icon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { useUpdateProject } from '@/hooks/use-projects'

interface ProjectDescriptionEditorProps {
  projectId: string
  description: string | null | undefined
}

export function ProjectDescriptionEditor({ projectId, description }: ProjectDescriptionEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDescription, setEditedDescription] = useState(description ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const updateProject = useUpdateProject()

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditedDescription(description ?? '')
    setIsEditing(true)
  }

  const handleSave = async () => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        updates: { description: editedDescription.trim() || null },
      })
      setIsEditing(false)
    } catch {
      // Error handled by mutation
    }
  }

  const handleCancel = () => {
    setEditedDescription(description ?? '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel()
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSave()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Description
        </h3>
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={handleStartEdit}
          >
            <HugeiconsIcon icon={Edit02Icon} size={12} data-slot="icon" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a description..."
            className="min-h-[80px] text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={updateProject.isPending}>
              <HugeiconsIcon icon={Tick02Icon} size={12} data-slot="icon" />
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={updateProject.isPending}>
              <HugeiconsIcon icon={Cancel01Icon} size={12} data-slot="icon" />
              Cancel
            </Button>
          </div>
        </div>
      ) : description ? (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {description}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">No description</p>
      )}
    </div>
  )
}
