import { useState, useMemo, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRepositories } from '@/hooks/use-repositories'
import { useBranches } from '@/hooks/use-filesystem'
import { useUpdateTask } from '@/hooks/use-tasks'
import { useDefaultAgent } from '@/hooks/use-config'
import { AGENT_DISPLAY_NAMES, type AgentType, type Task } from '@/types'

interface CodeTaskSettingsProps {
  task: Task
  compact?: boolean
}

export function CodeTaskSettings({ task, compact }: CodeTaskSettingsProps) {
  const { data: repositories } = useRepositories()
  const { data: defaultAgent } = useDefaultAgent()
  const updateTask = useUpdateTask()

  // Local state for the toggle
  const [isCodeTask, setIsCodeTask] = useState(!!task.repositoryId)
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(task.repositoryId || null)
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [agent, setAgent] = useState<AgentType>((task.agent as AgentType) || defaultAgent || 'claude')
  const [baseBranch, setBaseBranch] = useState(task.baseBranch || '')

  // Get selected repository
  const selectedRepo = selectedRepoId ? repositories?.find((r) => r.id === selectedRepoId) : null

  // Fetch branches when repository is selected
  const { data: branchData, isLoading: branchesLoading } = useBranches(selectedRepo?.path || null)

  // Set default base branch when branches are loaded
  useEffect(() => {
    if (branchData && !baseBranch) {
      setBaseBranch(branchData.defaultBranch || branchData.branches[0] || 'main')
    }
  }, [branchData, baseBranch])

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
    setIsCodeTask(checked)
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

  const paddingClass = compact ? 'p-3' : 'p-4'
  const marginClass = compact ? 'mb-2' : 'mb-3'
  const headingClass = compact ? 'text-xs' : 'text-sm'

  return (
    <div className={`rounded-lg border bg-card ${paddingClass}`}>
      <div className={`flex items-center justify-between ${marginClass}`}>
        <h2 className={`${headingClass} font-medium text-muted-foreground`}>Code Task</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">
            {isCodeTask ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={isCodeTask}
            onCheckedChange={handleToggleChange}
            size="sm"
          />
        </label>
      </div>

      {isCodeTask && (
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
                  <ComboboxEmpty>No repositories found</ComboboxEmpty>
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
                  {branchData?.branches.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                      {b === branchData.current && (
                        <span className="text-muted-foreground ml-2">(current)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Instructions */}
          {selectedRepoId && (
            <p className="text-xs text-muted-foreground">
              Move to In Progress to create worktree and start coding.
            </p>
          )}
        </div>
      )}

      {!isCodeTask && (
        <p className={`text-muted-foreground italic ${compact ? 'text-xs' : 'text-sm'}`}>
          Enable to associate a repository and create a worktree when work starts.
        </p>
      )}
    </div>
  )
}
