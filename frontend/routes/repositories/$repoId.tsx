import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useRepository, useUpdateRepository, useDeleteRepository } from '@/hooks/use-repositories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft02Icon,
  Delete02Icon,
  Folder01Icon,
  FolderAddIcon,
  Loading03Icon,
  Alert02Icon,
  TaskAdd01Icon,
  Tick02Icon,
  GridViewIcon,
  Link01Icon,
  GithubIcon,
  ComputerTerminal01Icon,
  VisualStudioCodeIcon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { CreateTaskModal } from '@/components/kanban/create-task-modal'
import { DeleteRepositoryDialog } from '@/components/repositories/delete-repository-dialog'
import { AddRepositoryDialog } from '@/components/repositories/add-repository-dialog'
import { useAppByRepository, useFindCompose } from '@/hooks/use-apps'
import { AgentOptionsEditor } from '@/components/repositories/agent-options-editor'
import { FilesViewer } from '@/components/viewer/files-viewer'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { Terminal } from '@/components/terminal/terminal'
import { useTerminalWS } from '@/hooks/use-terminal-ws'
import { log } from '@/lib/logger'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useOpenInTerminal } from '@/hooks/use-open-in-terminal'
import { useEditorApp, useEditorHost, useEditorSshPort } from '@/hooks/use-config'
import { buildEditorUrl, getEditorDisplayName, openExternalUrl } from '@/lib/editor-url'
import type { Terminal as XTerm } from '@xterm/xterm'
import { AGENT_DISPLAY_NAMES, type AgentType } from '@/types'
import { ModelPicker } from '@/components/opencode/model-picker'

/**
 * Convert a git URL (SSH or HTTPS) to a web-browsable HTTPS URL
 */
function gitUrlToHttps(url: string): string {
  // Handle SSH format: git@github.com:user/repo.git
  const sshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }
  // Already HTTPS or other format - strip .git suffix if present
  return url.replace(/\.git$/, '')
}

/**
 * Hook to fetch the git remote URL for a repository path
 */
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
    staleTime: 60 * 1000, // Cache for 1 minute
  })
}

type RepoTab = 'settings' | 'workspace'

interface RepoDetailSearch {
  tab?: RepoTab
  file?: string
}

/**
 * Repository detail view with integrated workspace (terminal + files).
 */
function RepositoryDetailView() {
  const { t } = useTranslation('repositories')
  const { repoId } = Route.useParams()
  const { tab, file } = Route.useSearch()
  const navigate = useNavigate()
  const { data: repository, isLoading, error } = useRepository(repoId)
  const updateRepository = useUpdateRepository()
  const deleteRepository = useDeleteRepository()
  const { data: remoteUrl } = useGitRemoteUrl(repository?.path)
  const linkedApp = useAppByRepository(repository?.id ?? null)
  const { data: composeInfo, isLoading: composeLoading } = useFindCompose(repository?.id ?? null)

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
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [composeWarningOpen, setComposeWarningOpen] = useState(false)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false)
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<'terminal' | 'files'>('terminal')

  // Terminal state
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [isCreatingTerminal, setIsCreatingTerminal] = useState(false)
  const [xtermReady, setXtermReady] = useState(false)
  const [containerReady, setContainerReady] = useState(false)
  const termRef = useRef<XTerm | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const createdTerminalRef = useRef(false)
  const attachedRef = useRef(false)

  const {
    terminals,
    terminalsLoaded,
    connected,
    createTerminal,
    attachXterm,
    resizeTerminal,
    setupImagePaste,
    writeToTerminal,
  } = useTerminalWS()

  const activeTab = tab || 'settings'
  const isMobile = useIsMobile()
  const { openInTerminal } = useOpenInTerminal()
  const { data: editorApp } = useEditorApp()
  const { data: editorHost } = useEditorHost()
  const { data: editorSshPort } = useEditorSshPort()

  const handleOpenEditor = () => {
    if (!repository) return
    const url = buildEditorUrl(repository.path, editorApp, editorHost, editorSshPort)
    openExternalUrl(url)
  }

  const handleCreateApp = () => {
    if (composeLoading) return
    if (!composeInfo?.found) {
      setComposeWarningOpen(true)
    } else {
      navigate({ to: '/apps/new', search: { repoId } })
    }
  }

  // Log on mount
  useEffect(() => {
    log.repoTerminal.info('component mounted', { repoId, tab, activeTab })
  }, [repoId, tab, activeTab])

  useEffect(() => {
    log.repoTerminal.debug('state changed', {
      terminalId,
      xtermReady,
      containerReady,
      connected,
      terminalsLoaded,
      terminalCount: terminals.length,
      repoPath: repository?.path,
    })
  }, [terminalId, xtermReady, containerReady, connected, terminalsLoaded, terminals.length, repository?.path])

  const setActiveTab = useCallback(
    (newTab: RepoTab) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: newTab === 'settings' ? {} : { tab: newTab, file },
        replace: true,
      })
    },
    [navigate, repoId, file]
  )

  const handleFileChange = useCallback(
    (newFile: string | null) => {
      navigate({
        to: '/repositories/$repoId',
        params: { repoId },
        search: { tab: 'workspace', file: newFile ?? undefined },
        replace: true,
      })
    },
    [navigate, repoId]
  )

  // Initialize form state when repository loads
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

  const handleDelete = async (deleteDirectory: boolean) => {
    if (!repository) return
    await deleteRepository.mutateAsync({ id: repository.id, deleteDirectory })
    navigate({ to: '/repositories' })
  }

  // Reset terminal state when repository changes
  // Note: Don't reset xtermReady - the Terminal component stays mounted and reuses the same xterm instance
  useEffect(() => {
    createdTerminalRef.current = false
    attachedRef.current = false
    setTerminalId(null)
    setIsCreatingTerminal(false)
  }, [repository?.path])

  // Find or create terminal when workspace tab is active
  useEffect(() => {
    if (!connected || !repository?.path || !terminalsLoaded || activeTab !== 'workspace' || !xtermReady) {
      log.repoTerminal.debug('find/create: waiting', { connected, path: repository?.path, terminalsLoaded, activeTab, xtermReady })
      return
    }

    // Look for existing running terminal with matching cwd
    const existingTerminal = terminals.find((t) => t.cwd === repository.path && t.status === 'running')
    if (existingTerminal) {
      log.repoTerminal.info('found existing terminal', { id: existingTerminal.id, cwd: existingTerminal.cwd })
      setTerminalId(existingTerminal.id)
      return
    }

    // Create terminal only once
    if (!createdTerminalRef.current && termRef.current) {
      createdTerminalRef.current = true
      setIsCreatingTerminal(true)
      const { cols, rows } = termRef.current
      log.repoTerminal.info('creating terminal', { name: repository.displayName, cwd: repository.path, cols, rows })
      createTerminal({
        name: repository.displayName,
        cols,
        rows,
        cwd: repository.path,
      })
    }
  }, [connected, repository?.path, repository?.displayName, terminalsLoaded, terminals, activeTab, createTerminal, xtermReady])

  // Update terminalId when terminal appears in list
  useEffect(() => {
    if (!repository?.path) return

    const matchingTerminal = terminals.find((t) => t.cwd === repository.path && t.status === 'running')
    if (!matchingTerminal) return

    const currentTerminalExists = terminalId && terminals.some((t) => t.id === terminalId)

    if (!terminalId || !currentTerminalExists) {
      setTerminalId(matchingTerminal.id)
      setIsCreatingTerminal(false)
      if (terminalId && !currentTerminalExists) {
        attachedRef.current = false
      }
    }
  }, [terminals, repository?.path, terminalId])

  // Terminal callbacks
  const handleTerminalReady = useCallback((xterm: XTerm) => {
    log.repoTerminal.info('xterm ready')
    termRef.current = xterm
    setXtermReady(true)
  }, [])

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    if (terminalId) {
      resizeTerminal(terminalId, cols, rows)
    }
  }, [terminalId, resizeTerminal])

  const handleTerminalContainerReady = useCallback((container: HTMLDivElement) => {
    log.repoTerminal.info('container ready')
    containerRef.current = container
    setContainerReady(true)
  }, [])

  const handleTerminalSend = useCallback((data: string) => {
    if (terminalId) {
      writeToTerminal(terminalId, data)
    }
  }, [terminalId, writeToTerminal])

  // Attach xterm to terminal once we have terminalId and both xterm/container are ready
  useEffect(() => {
    if (!terminalId || !xtermReady || !containerReady) {
      log.repoTerminal.debug('attach effect: waiting', { terminalId, xtermReady, containerReady })
      return
    }
    if (!termRef.current || !containerRef.current) {
      log.repoTerminal.warn('attach effect: refs not set despite ready states', { terminalId })
      return
    }
    if (attachedRef.current) {
      log.repoTerminal.debug('attach effect: already attached', { terminalId })
      return
    }

    log.repoTerminal.info('attaching terminal', { terminalId })
    attachXterm(terminalId, termRef.current)
    setupImagePaste(containerRef.current, terminalId)
    attachedRef.current = true

    return () => {
      log.repoTerminal.debug('detaching terminal', { terminalId })
      attachedRef.current = false
    }
  }, [terminalId, xtermReady, containerReady, attachXterm, setupImagePaste])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          strokeWidth={2}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  if (error || !repository) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
          <Link to="/repositories" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2} />
            {t('detailView.breadcrumb')}
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-destructive">
            <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} />
            <span className="text-sm">{t('detailView.notFound')}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTaskModalOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={TaskAdd01Icon} size={16} strokeWidth={2} data-slot="icon" className="-translate-y-px" />
            <span className="max-sm:hidden">{t('newTask')}</span>
          </Button>

          {repository.isCopierTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewProjectDialogOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('newProject.button')}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/tasks', search: { repo: repository.displayName } })}
            className="text-muted-foreground hover:text-foreground"
            title={t('viewTasks')}
          >
            <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('viewTasks')}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => openInTerminal(repository.path, repository.displayName)}
            className="text-muted-foreground hover:text-foreground"
            title={t('openInTerminal')}
          >
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('terminal')}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenEditor}
            className="text-muted-foreground hover:text-foreground"
            title={t('openInEditor', { editor: getEditorDisplayName(editorApp) })}
          >
            <HugeiconsIcon icon={VisualStudioCodeIcon} size={14} strokeWidth={2} data-slot="icon" />
            <span className="max-sm:hidden">{t('editor')}</span>
          </Button>

          {linkedApp ? (
            <Link to="/apps" search={{ repo: repository.displayName }}>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
                <span className="max-sm:hidden">{t('applications')}</span>
              </Button>
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleCreateApp}
              disabled={composeLoading}
            >
              <HugeiconsIcon icon={Rocket01Icon} size={14} strokeWidth={2} data-slot="icon" />
              <span className="max-sm:hidden">{t('createApp')}</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <GitStatusBadge worktreePath={repository.path} />
          <span className="text-sm font-medium">{repository.displayName}</span>
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
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as RepoTab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border bg-muted/50 px-4">
          <TabsList variant="line">
            <TabsTrigger value="settings" className="px-3 py-1.5">{t('detailView.tabs.settings')}</TabsTrigger>
            <TabsTrigger value="workspace" className="px-3 py-1.5">{t('detailView.tabs.workspace')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Repository path header */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={2} />
                <span className="font-mono break-all">{repository.path}</span>
              </div>

              {/* Two-column layout */}
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Left column: General settings */}
                <div className="flex-1 bg-card rounded-lg p-6 border border-border">
                  <h3 className="text-sm font-medium mb-4">{t('detailView.settings.generalTitle')}</h3>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="displayName">{t('detailView.settings.displayName')}</FieldLabel>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={repository.path.split('/').pop() || 'My Project'}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>{t('detailView.settings.defaultAgent')}</FieldLabel>
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
                      <FieldLabel htmlFor="startupScript">{t('detailView.settings.startupScript')}</FieldLabel>
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
                      <FieldLabel htmlFor="copyFiles">{t('detailView.settings.copyFiles')}</FieldLabel>
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
                  <h3 className="text-sm font-medium mb-4">{t('detailView.settings.agentTitle')}</h3>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>{t('detailView.settings.claudeOptions')}</FieldLabel>
                      <FieldDescription className="mb-2">
                        {t('detailView.settings.claudeOptionsDescription')}
                      </FieldDescription>
                      <AgentOptionsEditor
                        value={claudeOptions}
                        onChange={setClaudeOptions}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>{t('detailView.settings.opencodeOptions')}</FieldLabel>
                      <FieldDescription className="mb-2">
                        {t('detailView.settings.opencodeOptionsDescription')}
                      </FieldDescription>
                      <AgentOptionsEditor
                        value={opencodeOptions}
                        onChange={setOpencodeOptions}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>{t('detailView.settings.opencodeModel')}</FieldLabel>
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
        </TabsContent>

        <TabsContent value="workspace" className="flex-1 overflow-hidden mt-0">
          {isMobile ? (
            <Tabs
              value={mobileWorkspaceTab}
              onValueChange={(v) => setMobileWorkspaceTab(v as 'terminal' | 'files')}
              className="flex min-h-0 flex-1 flex-col h-full"
            >
              <div className="shrink-0 border-b border-border px-2 py-1">
                <TabsList className="w-full">
                  <TabsTrigger value="terminal" className="flex-1">{t('detailView.mobileWorkspace.terminal')}</TabsTrigger>
                  <TabsTrigger value="files" className="flex-1">{t('detailView.mobileWorkspace.files')}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="terminal" className="flex-1 min-h-0">
                <div className="h-full flex flex-col">
                  {!connected && (
                    <div className="shrink-0 px-2 py-1 bg-muted-foreground/20 text-muted-foreground text-xs">
                      {t('detailView.workspace.connectingToTerminal')}
                    </div>
                  )}
                  {isCreatingTerminal && !terminalId && (
                    <div className="flex-1 flex items-center justify-center bg-terminal-background">
                      <div className="flex flex-col items-center gap-3">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={24}
                          strokeWidth={2}
                          className="animate-spin text-muted-foreground"
                        />
                        <span className="font-mono text-sm text-muted-foreground">
                          {t('detailView.workspace.initializingTerminal')}
                        </span>
                      </div>
                    </div>
                  )}
                  <Terminal
                    className="flex-1"
                    onReady={handleTerminalReady}
                    onResize={handleTerminalResize}
                    onContainerReady={handleTerminalContainerReady}
                    terminalId={terminalId ?? undefined}
                    setupImagePaste={setupImagePaste}
                    onSend={handleTerminalSend}
                  />
                </div>
              </TabsContent>

              <TabsContent value="files" className="flex-1 min-h-0">
                <FilesViewer
                  worktreePath={repository.path}
                  initialSelectedFile={file}
                  onFileChange={handleFileChange}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col">
                  {!connected && (
                    <div className="shrink-0 px-2 py-1 bg-muted-foreground/20 text-muted-foreground text-xs">
                      {t('detailView.workspace.connectingToTerminal')}
                    </div>
                  )}
                  {isCreatingTerminal && !terminalId && (
                    <div className="flex-1 flex items-center justify-center bg-terminal-background">
                      <div className="flex flex-col items-center gap-3">
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={24}
                          strokeWidth={2}
                          className="animate-spin text-muted-foreground"
                        />
                        <span className="font-mono text-sm text-muted-foreground">
                          {t('detailView.workspace.initializingTerminal')}
                        </span>
                      </div>
                    </div>
                  )}
                  <Terminal
                    className="flex-1"
                    onReady={handleTerminalReady}
                    onResize={handleTerminalResize}
                    onContainerReady={handleTerminalContainerReady}
                    terminalId={terminalId ?? undefined}
                    setupImagePaste={setupImagePaste}
                    onSend={handleTerminalSend}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={30}>
                <FilesViewer
                  worktreePath={repository.path}
                  initialSelectedFile={file}
                  onFileChange={handleFileChange}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </TabsContent>
      </Tabs>

      <CreateTaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        defaultRepository={repository}
        showTrigger={false}
      />

      <DeleteRepositoryDialog
        repository={repository}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={handleDelete}
      />

      <AddRepositoryDialog
        initialTemplateSource={repository.id}
        open={newProjectDialogOpen}
        onOpenChange={setNewProjectDialogOpen}
      />

      <Dialog open={composeWarningOpen} onOpenChange={setComposeWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createAppDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('createAppDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {t('createAppDialog.instructions')}
          </p>
          <DialogFooter>
            <Button onClick={() => setComposeWarningOpen(false)}>
              {t('createAppDialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export const Route = createFileRoute('/repositories/$repoId')({
  component: RepositoryDetailView,
  validateSearch: (search: Record<string, unknown>): RepoDetailSearch => ({
    tab: search.tab === 'workspace' ? 'workspace' : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
})
