import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useCreateJob } from '@/hooks/use-jobs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Loading03Icon,
  Calendar02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

export const Route = createFileRoute('/jobs/new')({
  component: NewJobView,
})

function NewJobView() {
  const { t } = useTranslation('jobs')
  const navigate = useNavigate()
  const createJob = useCreateJob()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [schedule, setSchedule] = useState('')
  const [command, setCommand] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [persistent, setPersistent] = useState(true)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = 'Name is required'
    } else if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      newErrors.name = 'Name must contain only alphanumeric characters, hyphens, and underscores'
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (!schedule.trim()) {
      newErrors.schedule = 'Schedule is required'
    }

    if (!command.trim()) {
      newErrors.command = 'Command is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    try {
      await createJob.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        schedule: schedule.trim(),
        command: command.trim(),
        workingDirectory: workingDirectory.trim() || undefined,
        persistent,
      })

      toast.success('Job created successfully')
      navigate({ to: '/monitoring', search: { tab: 'jobs' } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-background px-4 py-3">
        <Link to="/monitoring" search={{ tab: 'jobs' }} className="text-muted-foreground hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
        </Link>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Calendar02Icon} size={20} strokeWidth={2} className="text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t('create.title')}</h1>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('create.name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create.namePlaceholder')}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('create.nameHelp')}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('create.description')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('create.descriptionPlaceholder')}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label htmlFor="schedule">{t('create.schedule')}</Label>
            <Input
              id="schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="*-*-* 02:00:00"
              className={errors.schedule ? 'border-destructive' : ''}
            />
            {errors.schedule ? (
              <p className="text-sm text-destructive">{errors.schedule}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('create.scheduleHelp')}</p>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground">Examples:</span>
              <button
                type="button"
                onClick={() => setSchedule('daily')}
                className="text-primary hover:underline"
              >
                daily
              </button>
              <button
                type="button"
                onClick={() => setSchedule('weekly')}
                className="text-primary hover:underline"
              >
                weekly
              </button>
              <button
                type="button"
                onClick={() => setSchedule('*-*-* 02:00:00')}
                className="text-primary hover:underline"
              >
                *-*-* 02:00:00
              </button>
              <button
                type="button"
                onClick={() => setSchedule('Mon..Fri 09:00')}
                className="text-primary hover:underline"
              >
                Mon..Fri 09:00
              </button>
            </div>
          </div>

          {/* Command */}
          <div className="space-y-2">
            <Label htmlFor="command">{t('create.command')}</Label>
            <Textarea
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('create.commandPlaceholder')}
              className={`font-mono ${errors.command ? 'border-destructive' : ''}`}
              rows={3}
            />
            {errors.command && (
              <p className="text-sm text-destructive">{errors.command}</p>
            )}
          </div>

          {/* Working Directory */}
          <div className="space-y-2">
            <Label htmlFor="workingDir">{t('create.workingDir')}</Label>
            <Input
              id="workingDir"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder={t('create.workingDirPlaceholder')}
            />
          </div>

          {/* Persistent */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="persistent"
              checked={persistent}
              onCheckedChange={(checked) => setPersistent(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="persistent" className="cursor-pointer">
                {t('create.persistent')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('create.persistentHelp')}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4">
            <Link to="/monitoring" search={{ tab: 'jobs' }}>
              <Button type="button" variant="outline">
                {t('create.cancel')}
              </Button>
            </Link>
            <Button type="submit" disabled={createJob.isPending}>
              {createJob.isPending && (
                <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" data-slot="icon" />
              )}
              {t('create.create')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
