import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { useRepositories } from '@/hooks/use-repositories'
import { useBranches } from '@/hooks/use-filesystem'
import { useUpdateTask, useInitializeScratchTask } from '@/hooks/use-tasks'
import { useDefaultAgent } from '@/hooks/use-config'
import { AGENT_DISPLAY_NAMES, type AgentType, type Task } from '@/types'
import { InitializeWorktreeTaskModal } from './initialize-worktree-task-modal'

interface WorktreeTaskSettingsProps {
  task: Task
  compact?: boolean
}

export function WorktreeTaskSettings({ task, compact }: WorktreeTaskSettingsProps) {
  const navigate = useNavigate()
  const { data: repositories } = useRepositories()
  const { data: defaultAgent } = useDefaultAgent()
  const updateTask = useUpdateTask()
  const initializeScratch = useInitializeScratchTask()

  // Local state for the toggle
  const [isWorktreeTask, setIsWorktreeTask] = useState(!!task.repositoryId)
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(task.repositoryId || null)
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [agent, setAgent] = useState<AgentType>((task.agent as AgentType) || defaultAgent || 'claude')
  const [baseBranch, setBaseBranch] = useState(task.baseBranch || '')
  const [initializeModalOpen, setInitializeModalOpen] = useState(false)

  // Get selected repository
  const selectedRepo = selectedRepoId ? repositories?.find((r) => r.id === selectedRepoId) : null

  // Fetch branches when repository is selected
  const { data: branchData, isLoading: branchesLoading } = useBranches(selectedRepo?.path || null)

  // Set default base branch when branches are loaded
  useEffect(() => {
    if (branchData && !baseBranch) {
      setBaseBranch(
        selectedRepo?.defaultBaseBranch ||
        selectedRepo?.lastBaseBranch ||
        branchData.defaultBaseBranch || 
        branchData.defaultBranch || 
        (branchData.localBranches && branchData.localBranches.length > 0 ? branchData.localBranches[0].name : null) || 
        branchData.branches?.[0] || 
        'main'
      )
    }
  }, [branchData, baseBranch, selectedRepo])

  // Initialize search query with repo name when we have a selected repo
  useEffect(() => {
    if (selectedRepo && !repoSearchQuery) {
      setRepoSearchQuery(selectedRepo.displayName)
    }
  }, [selectedRepo, repoSearchQuery])

  // Filter repositories based on search query
  const filteredRepositories = useMemo(() => {
    if (!repositories) return []
    if (selectedRepo && repoSearchQuery === selectedRepo.displayName) {
      return repositories
    }
    if (!repoSearchQuery.trim()) return repositories
    const query = repoSearchQuery.toLowerCase()
    return repositories.filter((repo) =>
      repo.displayName.toLowerCase().includes(query) ||
      repo.path.toLowerCase().includes(query)
    )
  }, [repositories, repoSearchQuery, selectedRepo])

  // Handle toggle change
  const handleToggleChange = (checked: boolean) => {
    setIsWorktreeTask(checked)
    if (!checked) {
      // Clear repository selection when toggling off
      setSelectedRepoId(null)
      setRepoSearchQuery('')
      setBaseBranch('')
      updateTask.mutate({
        taskId: task.id,
        updates: { repositoryId: null, baseBranch: null },
      })
    }
  }

  // Handle repository selection
  const handleRepoSelect = (repoId: string | null) => {
    if (!repoId) return
    const repo = repositories?.find((r) => r.id === repoId)
    if (repo) {
      setSelectedRepoId(repoId)
      setRepoSearchQuery(repo.displayName)

      // Use repo's default agent if set
      const repoAgent = repo.defaultAgent || defaultAgent || 'claude'
      setAgent(repoAgent as AgentType)

      // Save to task
      updateTask.mutate({
        taskId: task.id,
        updates: {
          repositoryId: repoId,
          agent: repoAgent,
        } as Partial<Task>,
      })
    }
  }

  // Handle agent change
  const handleAgentChange = (newAgent: AgentType) => {
    setAgent(newAgent)
    updateTask.mutate({
      taskId: task.id,
      updates: { agent: newAgent } as Partial<Task>,
    })
  }

  // Handle base branch change
  const handleBaseBranchChange = (newBranch: string | null) => {
    if (!newBranch) return
    setBaseBranch(newBranch)
    updateTask.mutate({
      taskId: task.id,
      updates: { baseBranch: newBranch },
    })
  }

  // Handle scratch task initialization
  const handleInitializeScratch = () => {
    initializeScratch.mutate(
      { taskId: task.id, agent: agent || defaultAgent || 'claude' },
      {
        onSuccess: (data) => {
          if (data) {
            navigate({ to: '/tasks/$taskId', params: { taskId: task.id } })
          }
        },
      }
    )
  }

  const paddingClass = compact ? 'p-3' : 'p-4'
  const marginClass = compact ? 'mb-2' : 'mb-3'
  const headingClass = compact ? 'text-xs' : 'text-sm'

  // Uninitialized scratch task — show initialize button directly
  if (task.type === 'scratch') {
    return (
      <div className={`rounded-lg border bg-card ${paddingClass}`}>
        <h2 className={`${headingClass} font-medium text-muted-foreground ${marginClass}`}>Scratch Task</h2>
        <Button
          variant="outline"
          onClick={handleInitializeScratch}
          disabled={initializeScratch.isPending}
          className="w-full"
          size={compact ? 'sm' : 'default'}
        >
          {initializeScratch.isPending ? 'Creating...' : 'Initialize Scratch Task'}
        </Button>
        <p className={`text-muted-foreground italic mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
          Creates an isolated directory without git for quick experiments.
        </p>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border bg-card ${paddingClass}`}>
      {/* Worktree section */}
      <div className={`flex items-center justify-between ${marginClass}`}>
        <h2 className={`${headingClass} font-medium text-muted-foreground`}>Worktree Task</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">
            {isWorktreeTask ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={isWorktreeTask}
            onCheckedChange={handleToggleChange}
            size="sm"
          />
        </label>
      </div>

      {isWorktreeTask && (
        <div className="space-y-3">
          {/* Repository selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Repository
            </label>
            <Combobox
              value={selectedRepoId || ''}
              onValueChange={handleRepoSelect}
              inputValue={repoSearchQuery}
              onInputValueChange={setRepoSearchQuery}
              filter={null}
              itemToStringLabel={(id) =>
                repositories?.find((r) => r.id === id)?.displayName || ''
              }
            >
              <ComboboxInput
                placeholder="Search repositories..."
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxList>
                  {filteredRepositories.length === 0 && (
                    <div className="text-muted-foreground w-full flex justify-center py-2 text-center text-xs/relaxed">
                      No repositories found
                    </div>
                  )}
                  {filteredRepositories.map((repo) => (
                    <ComboboxItem key={repo.id} value={repo.id}>
                      {repo.displayName}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {selectedRepo && (
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                {selectedRepo.path}
              </p>
            )}
          </div>

          {/* Agent selector */}
          {selectedRepoId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Agent
              </label>
              <Select value={agent} onValueChange={(value) => handleAgentChange(value as AgentType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AGENT_DISPLAY_NAMES) as AgentType[]).map((agentType) => (
                    <SelectItem key={agentType} value={agentType}>
                      {AGENT_DISPLAY_NAMES[agentType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Base branch selector */}
          {selectedRepoId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Base Branch
              </label>
              <Select
                value={baseBranch}
                onValueChange={handleBaseBranchChange}
                disabled={branchesLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {baseBranch || (
                      <span className="text-muted-foreground">
                        {branchesLoading ? 'Loading branches...' : 'Select branch'}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branchData?.localBranches ? (
                    <>
                      {branchData.localBranches.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Local Branches</SelectLabel>
                          {branchData.localBranches.map((b) => (
                            <SelectItem key={`local-${b.name}`} value={b.name}>
                              <div className="flex items-center gap-2">
                                <span>{b.name}</span>
                                {b.current && (
                                  <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded-full text-accent-foreground">current</span>
                                )}
                                {b.default && (
                                  <span className="text-[10px] border border-border px-1.5 py-0.5 rounded-full text-muted-foreground">default</span>
                                )}
                                {(b.ahead > 0 || b.behind > 0) && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {b.ahead > 0 && `↑${b.ahead}`}
                                    {b.behind > 0 && ` ↓${b.behind}`}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {branchData.remoteBranches && branchData.remoteBranches.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Remote Branches</SelectLabel>
                          {branchData.remoteBranches.map((b) => (
                            <SelectItem key={`remote-${b.name}`} value={b.name}>
                              <div className="flex items-center gap-2">
                                <span>{b.name}</span>
                                {b.default && (
                                  <span className="text-[10px] border border-border px-1.5 py-0.5 rounded-full text-muted-foreground">default</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </>
                  ) : (
                    branchData?.branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                        {b === branchData.current && (
                          <span className="text-muted-foreground ml-2">(current)</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Initialize Task Button */}
          {selectedRepoId && (
            <Button
              onClick={() => setInitializeModalOpen(true)}
              className="w-full"
              size={compact ? 'sm' : 'default'}
            >
              Initialize Task
            </Button>
          )}
        </div>
      )}

      {!isWorktreeTask && (
        <p className={`text-muted-foreground italic ${compact ? 'text-xs' : 'text-sm'}`}>
          Enable to associate a repository and create a worktree when work starts.
        </p>
      )}

      {/* Scratch task section - separator + button (hide if already a scratch or worktree type) */}
      {!isWorktreeTask && task.type !== 'scratch' && task.type !== 'worktree' && (
        <>
          <div className="my-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            onClick={handleInitializeScratch}
            disabled={initializeScratch.isPending}
            className="w-full"
            size={compact ? 'sm' : 'default'}
          >
            {initializeScratch.isPending ? 'Creating...' : 'Initialize as Scratch Task'}
          </Button>
          <p className={`text-muted-foreground italic mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
            Creates an isolated directory without git for quick experiments.
          </p>
        </>
      )}

      <InitializeWorktreeTaskModal
        task={task}
        open={initializeModalOpen}
        onOpenChange={setInitializeModalOpen}
      />
    </div>
  )
}
