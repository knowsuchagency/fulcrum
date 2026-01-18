import { useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { fetchJSON } from '@/lib/api'
import { useRepository, useUpdateRepository } from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Loading03Icon,
  Alert02Icon,
  Folder01Icon,
  Settings05Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { AGENT_DISPLAY_NAMES, type AgentType } from '@/types'
import type { ProjectWithDetails } from '@/types'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/repositories/$repoId')({
  loader: async ({ params }) => {
    // Check if there's a project for this repository - if so, redirect
    const projects = await fetchJSON<ProjectWithDetails[]>('/api/projects')
    const project = projects.find(
      (p) => p.repository?.id === params.repoId ||
             p.repositories.some((r) => r.id === params.repoId)
    )

    if (project) {
      throw redirect({
        to: '/projects/$projectId',
        params: { projectId: project.id },
      })
    }

    // No project, show standalone repository view
    return { repoId: params.repoId }
  },
  component: RepositoryDetailView,
})

function RepositoryDetailView() {
  const { repoId } = Route.useLoaderData()
  const { data: repository, isLoading, error } = useRepository(repoId)
  const updateRepository = useUpdateRepository()

  // Settings state
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [defaultAgent, setDefaultAgent] = useState<AgentType | 'default'>('default')
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form state when repository loads
  if (repository && !hasChanges) {
    if (displayName !== repository.displayName) setDisplayName(repository.displayName)
    if (startupScript !== (repository.startupScript || '')) setStartupScript(repository.startupScript || '')
    if (copyFiles !== (repository.copyFiles || '')) setCopyFiles(repository.copyFiles || '')
    if (defaultAgent !== (repository.defaultAgent || 'default')) setDefaultAgent(repository.defaultAgent || 'default')
  }

  const handleSaveSettings = async () => {
    if (!repository) return
    try {
      await updateRepository.mutateAsync({
        id: repository.id,
        updates: {
          displayName,
          startupScript: startupScript || null,
          copyFiles: copyFiles || null,
          defaultAgent: defaultAgent === 'default' ? null : defaultAgent,
        },
      })
      toast.success('Settings saved')
      setHasChanges(false)
    } catch (err) {
      toast.error('Failed to save settings', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <HugeiconsIcon icon={Alert02Icon} size={24} className="text-destructive" />
        <p className="text-sm text-muted-foreground">Repository not found</p>
        <Link to="/repositories">
          <Button variant="outline" size="sm">
            Back to Repositories
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Link to="/repositories">
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} data-slot="icon" />
            <span className="max-sm:hidden">Repositories</span>
          </Button>
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Folder01Icon} size={14} className="text-muted-foreground" />
          <span className="text-sm font-mono text-muted-foreground truncate max-w-xs">
            {repository.path}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-3">
        <h1 className="text-lg font-semibold">{repository.displayName}</h1>
        <span className="text-sm text-muted-foreground">(Standalone Repository)</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="settings" className="flex-1 flex flex-col">
        <TabsList className="shrink-0 mx-4 mt-2">
          <TabsTrigger value="settings" className="gap-1.5">
            <HugeiconsIcon icon={Settings05Icon} size={14} />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="max-w-2xl px-6 py-6 space-y-8">
              <FieldGroup>
                <Field>
                  <FieldLabel>Display Name</FieldLabel>
                  <FieldDescription>Name shown in the UI</FieldDescription>
                  <Input
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder="Repository name"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <FieldLabel>Startup Script</FieldLabel>
                  <FieldDescription>
                    Command to run after creating a worktree (e.g., install dependencies)
                  </FieldDescription>
                  <Textarea
                    value={startupScript}
                    onChange={(e) => {
                      setStartupScript(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder="npm install"
                    className="font-mono text-sm"
                    rows={3}
                  />
                </Field>

                <Field>
                  <FieldLabel>Copy Files</FieldLabel>
                  <FieldDescription>
                    Comma-separated glob patterns for files to copy to new worktrees (e.g., .env, config.local.json)
                  </FieldDescription>
                  <Input
                    value={copyFiles}
                    onChange={(e) => {
                      setCopyFiles(e.target.value)
                      setHasChanges(true)
                    }}
                    placeholder=".env, config.local.json"
                    className="font-mono text-sm"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <FieldLabel>Default AI Agent</FieldLabel>
                  <FieldDescription>
                    Which AI coding agent to use by default for tasks
                  </FieldDescription>
                  <Select
                    value={defaultAgent}
                    onValueChange={(value) => {
                      if (value) {
                        setDefaultAgent(value as AgentType | 'default')
                        setHasChanges(true)
                      }
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use Global Default</SelectItem>
                      {Object.entries(AGENT_DISPLAY_NAMES).map(([key, name]) => (
                        <SelectItem key={key} value={key}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              {/* Save button */}
              {hasChanges && (
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings} disabled={updateRepository.isPending}>
                    {updateRepository.isPending ? (
                      <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" data-slot="icon" />
                    ) : (
                      <HugeiconsIcon icon={Tick02Icon} size={14} data-slot="icon" />
                    )}
                    Save Settings
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
