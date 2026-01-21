import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { AGENT_DISPLAY_NAMES, type AgentType, type ProjectWithDetails } from '@/types'
import { AgentOptionsEditor } from '@/components/repositories/agent-options-editor'
import { ModelPicker } from '@/components/opencode/model-picker'
import { toast } from 'sonner'

interface ProjectAgentSettingsProps {
  project: ProjectWithDetails
}

export function ProjectAgentSettings({ project }: ProjectAgentSettingsProps) {
  const { t } = useTranslation('projects')
  const tRepo = useTranslation('repositories').t
  const updateProject = useUpdateProject()

  // Collapsible state - collapsed by default
  const [isOpen, setIsOpen] = useState(false)

  // Form state
  const [defaultAgent, setDefaultAgent] = useState<AgentType | null>(null)
  const [claudeOptions, setClaudeOptions] = useState<Record<string, string>>({})
  const [opencodeOptions, setOpencodeOptions] = useState<Record<string, string>>({})
  const [opencodeModel, setOpencodeModel] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form state from project
  useEffect(() => {
    if (project) {
      setDefaultAgent(project.defaultAgent ?? null)
      setClaudeOptions(project.claudeOptions ?? {})
      setOpencodeOptions(project.opencodeOptions ?? {})
      setOpencodeModel(project.opencodeModel ?? null)
      setHasChanges(false)
    }
  }, [project])

  // Track changes
  useEffect(() => {
    if (project) {
      const changed =
        defaultAgent !== (project.defaultAgent ?? null) ||
        JSON.stringify(claudeOptions) !== JSON.stringify(project.claudeOptions ?? {}) ||
        JSON.stringify(opencodeOptions) !== JSON.stringify(project.opencodeOptions ?? {}) ||
        opencodeModel !== (project.opencodeModel ?? null)
      setHasChanges(changed)
    }
  }, [defaultAgent, claudeOptions, opencodeOptions, opencodeModel, project])

  const handleSave = () => {
    if (!project) return

    updateProject.mutate(
      {
        id: project.id,
        updates: {
          defaultAgent,
          claudeOptions: Object.keys(claudeOptions).length > 0 ? claudeOptions : null,
          opencodeOptions: Object.keys(opencodeOptions).length > 0 ? opencodeOptions : null,
          opencodeModel,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('detailView.save'))
          setHasChanges(false)
        },
        onError: (error) => {
          toast.error(tRepo('detailView.failedToSave'), {
            description: error instanceof Error ? error.message : 'Unknown error',
          })
        },
      }
    )
  }

  // Generate summary text for collapsed state
  const getSummary = () => {
    const parts: string[] = []

    if (defaultAgent) {
      parts.push(`${t('agentSettings.summaryDefault')}: ${AGENT_DISPLAY_NAMES[defaultAgent]}`)
    } else {
      parts.push(`${t('agentSettings.summaryDefault')}: ${t('agentSettings.inherit')}`)
    }

    const claudeCount = Object.keys(claudeOptions).length
    if (claudeCount > 0) {
      parts.push(t('agentSettings.summaryClaudeOptions', { count: claudeCount }))
    }

    const opencodeCount = Object.keys(opencodeOptions).length
    if (opencodeCount > 0) {
      parts.push(t('agentSettings.summaryOpencodeOptions', { count: opencodeCount }))
    }

    if (opencodeModel) {
      parts.push(`${t('agentSettings.summaryModel')}: ${opencodeModel.split('/').pop()}`)
    }

    return parts.join(' \u00B7 ')
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4">
        <CollapsibleTrigger className="flex items-center gap-2 group">
          <HugeiconsIcon
            icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
            size={14}
            className="text-muted-foreground"
          />
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
            {t('detailView.general.agentTitle')}
          </h2>
          {!isOpen && (
            <span className="text-xs text-muted-foreground ml-2">
              {getSummary()}
            </span>
          )}
        </CollapsibleTrigger>

        {isOpen && hasChanges && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateProject.isPending}
          >
            <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} data-slot="icon" />
            {updateProject.isPending ? tRepo('detailView.saving') : tRepo('detailView.save')}
          </Button>
        )}
      </div>

      <CollapsibleContent>
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-4">
            {t('agentSettings.description')}
          </p>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left column */}
            <FieldGroup>
              <Field>
                <FieldLabel>{t('detailView.general.defaultAgent')}</FieldLabel>
                <Select
                  value={defaultAgent ?? 'inherit'}
                  onValueChange={(value) => setDefaultAgent(value === 'inherit' ? null : value as AgentType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="inherit">
                      {t('agentSettings.useGlobalDefault')}
                    </SelectItem>
                    {(Object.keys(AGENT_DISPLAY_NAMES) as AgentType[]).map((agentType) => (
                      <SelectItem key={agentType} value={agentType}>
                        {AGENT_DISPLAY_NAMES[agentType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {tRepo('detailView.settings.defaultAgentDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('detailView.general.claudeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {tRepo('detailView.settings.claudeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={claudeOptions}
                  onChange={setClaudeOptions}
                />
              </Field>
            </FieldGroup>

            {/* Right column */}
            <FieldGroup>
              <Field>
                <FieldLabel>{t('detailView.general.opencodeModel')}</FieldLabel>
                <ModelPicker
                  value={opencodeModel}
                  onChange={setOpencodeModel}
                  placeholder={tRepo('detailView.settings.opencodeModelPlaceholder')}
                />
                <FieldDescription>
                  {tRepo('detailView.settings.opencodeModelDescription')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>{t('detailView.general.opencodeOptions')}</FieldLabel>
                <FieldDescription className="mb-2">
                  {tRepo('detailView.settings.opencodeOptionsDescription')}
                </FieldDescription>
                <AgentOptionsEditor
                  value={opencodeOptions}
                  onChange={setOpencodeOptions}
                />
              </Field>
            </FieldGroup>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
