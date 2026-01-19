import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useUpdateRepository } from '@/hooks/use-repositories'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon, GithubIcon, Link01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { AGENT_DISPLAY_NAMES, type AgentType, type Repository } from '@/types'
import { AgentOptionsEditor } from '@/components/repositories/agent-options-editor'
import { ModelPicker } from '@/components/opencode/model-picker'
import { toast } from 'sonner'

interface RepositorySettingsTabProps {
  repository: Repository
}

// Helper to convert git URL to HTTPS
function gitUrlToHttps(url: string): string {
  const sshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }
  return url.replace(/\.git$/, '')
}

// Hook to fetch git remote URL
function useGitRemoteUrl(repoPath: string | undefined) {
  return useQuery({
    queryKey: ['git-remote', repoPath],
    queryFn: async () => {
      if (!repoPath) return null
      const res = await fetch(`/api/git/remote?path=${encodeURIComponent(repoPath)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.remoteUrl as string | null
    },
    enabled: !!repoPath,
    staleTime: 60 * 1000,
  })
}

export function RepositorySettingsTab({ repository }: RepositorySettingsTabProps) {
  const { t } = useTranslation('repositories')
  const tProjects = useTranslation('projects').t
  const updateRepository = useUpdateRepository()
  const { data: remoteUrl } = useGitRemoteUrl(repository.path)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [startupScript, setStartupScript] = useState('')
  const [copyFiles, setCopyFiles] = useState('')
  const [claudeOptions, setClaudeOptions] = useState<Record<string, string>>({})
  const [opencodeOptions, setOpencodeOptions] = useState<Record<string, string>>({})
  const [opencodeModel, setOpencodeModel] = useState<string | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<AgentType | null>(null)
  const [isCopierTemplate, setIsCopierTemplate] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form state
  useEffect(() => {
    if (repository) {
      setDisplayName(repository.displayName)
      setStartupScript(repository.startupScript || '')
      setCopyFiles(repository.copyFiles || '')
      setClaudeOptions(repository.claudeOptions || {})
      setOpencodeOptions(repository.opencodeOptions || {})
      setOpencodeModel(repository.opencodeModel ?? null)
      setDefaultAgent(repository.defaultAgent ?? null)
      setIsCopierTemplate(repository.isCopierTemplate ?? false)
      setHasChanges(false)
    }
  }, [repository])

  // Track changes
  useEffect(() => {
    if (repository) {
      const changed =
        displayName !== repository.displayName ||
        startupScript !== (repository.startupScript || '') ||
        copyFiles !== (repository.copyFiles || '') ||
        JSON.stringify(claudeOptions) !== JSON.stringify(repository.claudeOptions || {}) ||
        JSON.stringify(opencodeOptions) !== JSON.stringify(repository.opencodeOptions || {}) ||
        opencodeModel !== (repository.opencodeModel ?? null) ||
        defaultAgent !== (repository.defaultAgent ?? null) ||
        isCopierTemplate !== (repository.isCopierTemplate ?? false)
      setHasChanges(changed)
    }
  }, [displayName, startupScript, copyFiles, claudeOptions, opencodeOptions, opencodeModel, defaultAgent, isCopierTemplate, repository])

  const handleSave = () => {
    if (!repository) return

    updateRepository.mutate(
      {
        id: repository.id,
        updates: {
          displayName: displayName.trim() || repository.path.split('/').pop() || 'repo',
          startupScript: startupScript.trim() || null,
          copyFiles: copyFiles.trim() || null,
          claudeOptions: Object.keys(claudeOptions).length > 0 ? claudeOptions : null,
          opencodeOptions: Object.keys(opencodeOptions).length > 0 ? opencodeOptions : null,
          opencodeModel,
          defaultAgent,
          isCopierTemplate,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('detailView.saved'))
          setHasChanges(false)
        },
        onError: (error) => {
          toast.error(t('detailView.failedToSave'), {
            description: error instanceof Error ? error.message : 'Unknown error',
          })
        },
      }
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Repository path header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
          <span className="font-mono break-all">{repository.path}</span>
          {remoteUrl && (
            <a
              href={gitUrlToHttps(remoteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={remoteUrl}
            >
              <HugeiconsIcon
                icon={remoteUrl.includes('github.com') ? GithubIcon : Link01Icon}
                size={14}
                strokeWidth={2}
              />
            </a>
          )}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left column: General settings */}
          <div className="flex-1 bg-card rounded-lg p-6 border border-border">
            <h3 className="text-sm font-medium mb-4">{tProjects('detailView.general.repositoryTitle')}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="displayName">{tProjects('detailView.general.displayName')}</FieldLabel>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={repository.path.split('/').pop() || 'My Project'}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="startupScript">{tProjects('detailView.general.startupScript')}</FieldLabel>
                <Textarea
                  id="startupScript"
                  value={startupScript}
                  onChange={(e) => setStartupScript(e.target.value)}
                  placeholder={t('detailView.settings.startupScriptPlaceholder')}
                  rows={3}
                />
                <FieldDescription>
                  {t('detailView.settings.startupScriptDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="copyFiles">{tProjects('detailView.general.copyFiles')}</FieldLabel>
                <Input
                  id="copyFiles"
                  value={copyFiles}
                  onChange={(e) => setCopyFiles(e.target.value)}
                  placeholder={t('detailView.settings.copyFilesPlaceholder')}
                />
                <FieldDescription>
                  {t('detailView.settings.copyFilesDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isCopierTemplate}
                    onCheckedChange={(checked) => setIsCopierTemplate(checked === true)}
                  />
                  <FieldLabel className="cursor-pointer">{t('detailView.settings.isCopierTemplate')}</FieldLabel>
                </div>
                <FieldDescription>
                  {t('detailView.settings.isCopierTemplateDescription')}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>

          {/* Right column: Agent settings */}
          <div className="flex-1 bg-card rounded-lg p-6 border border-border">
            <h3 className="text-sm font-medium mb-4">{tProjects('detailView.general.agentTitle')}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel>{tProjects('detailView.general.defaultAgent')}</FieldLabel>
                <Select
                  value={defaultAgent ?? 'inherit'}
                  onValueChange={(value) => setDefaultAgent(value === 'inherit' ? null : value as AgentType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="inherit">
                      {t('detailView.settings.defaultAgentInherit')}
                    </SelectItem>
                    {(Object.keys(AGENT_DISPLAY_NAMES) as AgentType[]).map((agentType) => (
                      <SelectItem key={agentType} value={agentType}>
                        {AGENT_DISPLAY_NAMES[agentType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t('detailView.settings.defaultAgentDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{tProjects('detailView.general.claudeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {t('detailView.settings.claudeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={claudeOptions}
                  onChange={setClaudeOptions}
                />
              </Field>

              <Field>
                <FieldLabel>{tProjects('detailView.general.opencodeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {t('detailView.settings.opencodeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={opencodeOptions}
                  onChange={setOpencodeOptions}
                />
              </Field>

              <Field>
                <FieldLabel>{tProjects('detailView.general.opencodeModel')}</FieldLabel>
                <ModelPicker
                  value={opencodeModel}
                  onChange={setOpencodeModel}
                  placeholder={t('detailView.settings.opencodeModelPlaceholder')}
                />
                <FieldDescription>
                  {t('detailView.settings.opencodeModelDescription')}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end mt-4">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateRepository.isPending}
          >
            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} data-slot="icon" />
            {updateRepository.isPending ? t('detailView.saving') : t('detailView.save')}
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}
