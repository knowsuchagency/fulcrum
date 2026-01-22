import { useCallback, useMemo, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type NodeTypes,
  Handle,
  Position,
} from 'reactflow'
import dagre from '@dagrejs/dagre'
import { useTaskDependencyGraph, useTasks, type TaskGraphNode } from '@/hooks/use-tasks'
import { useProjects } from '@/hooks/use-projects'
import type { Task, TaskStatus } from '@/types'
import { NonWorktreeTaskModal } from '@/components/task/non-worktree-task-modal'
import 'reactflow/dist/style.css'

const STATUS_COLORS: Record<TaskStatus, { bg: string; border: string; text: string }> = {
  TO_DO: { bg: '#f3f4f6', border: '#6b7280', text: '#374151' },
  IN_PROGRESS: { bg: '#e5e7eb', border: '#8d909b', text: '#374151' },
  IN_REVIEW: { bg: '#fef3c7', border: '#e08d3c', text: '#92400e' },
  DONE: { bg: '#d1fae5', border: '#0d5c63', text: '#065f46' },
  CANCELED: { bg: '#fee2e2', border: '#dd403a', text: '#991b1b' },
}

interface TaskNodeData {
  task: TaskGraphNode
  isBlocked: boolean
  isBlocking: boolean
  direction: 'TB' | 'LR'
}

function TaskNode({ data }: { data: TaskNodeData }) {
  const { task, isBlocked, direction } = data
  const colors = STATUS_COLORS[task.status]
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE' && task.status !== 'CANCELED'

  // Handle positions based on layout direction
  const targetPosition = direction === 'LR' ? Position.Left : Position.Top
  const sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom

  return (
    <div
      className="rounded-lg shadow-md px-3 py-2 min-w-[180px] max-w-[240px] cursor-pointer transition-shadow hover:shadow-lg"
      style={{
        backgroundColor: colors.bg,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: isOverdue ? '#dd403a' : colors.border,
        opacity: isBlocked ? 0.7 : 1,
      }}
    >
      <Handle type="target" position={targetPosition} className="!bg-gray-400 !w-2 !h-2" />
      <div className="flex flex-col gap-1">
        <div
          className="font-medium text-sm leading-tight line-clamp-2"
          style={{ color: colors.text }}
        >
          {task.title}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: colors.border + '20',
              color: colors.border,
            }}
          >
            {task.status.replace('_', ' ')}
          </span>
          {isBlocked && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
              BLOCKED
            </span>
          )}
          {isOverdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
              OVERDUE
            </span>
          )}
        </div>
        {task.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600"
              >
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600">
                +{task.tags.length - 3}
              </span>
            )}
          </div>
        )}
        {task.dueDate && (
          <div
            className="text-[10px] mt-0.5"
            style={{ color: isOverdue ? '#dd403a' : '#6b7280' }}
          >
            Due: {new Date(task.dueDate).toLocaleDateString()}
          </div>
        )}
      </div>
      <Handle type="source" position={sourcePosition} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  task: TaskNode,
}

// Use dagre for automatic graph layout
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  const nodeWidth = 200
  const nodeHeight = 80

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

interface TaskDependencyGraphProps {
  className?: string
  projectFilter?: string | null
  tagsFilter?: string[]
}

const MOBILE_BREAKPOINT = 768

export function TaskDependencyGraph({ className, projectFilter, tagsFilter }: TaskDependencyGraphProps) {
  const navigate = useNavigate()
  const { data: graphData, isLoading } = useTaskDependencyGraph()
  const { data: allTasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Create a map of task IDs to full task objects for quick lookup
  const taskMap = useMemo(() => {
    return new Map(allTasks.map((t) => [t.id, t]))
  }, [allTasks])

  // Build sets of all repository IDs and paths that belong to projects (for inbox filtering)
  const { projectRepoIds, projectRepoPaths } = useMemo(() => {
    const ids = new Set<string>()
    const paths = new Set<string>()
    for (const project of projects) {
      for (const repo of project.repositories) {
        ids.add(repo.id)
        paths.add(repo.path)
      }
    }
    return { projectRepoIds: ids, projectRepoPaths: paths }
  }, [projects])

  // Get repository IDs and paths for the selected project filter
  const { selectedProjectRepoIds, selectedProjectRepoPaths } = useMemo(() => {
    if (!projectFilter || projectFilter === 'inbox') {
      return { selectedProjectRepoIds: new Set<string>(), selectedProjectRepoPaths: new Set<string>() }
    }
    const project = projects.find((p) => p.id === projectFilter)
    if (!project) {
      return { selectedProjectRepoIds: new Set<string>(), selectedProjectRepoPaths: new Set<string>() }
    }
    return {
      selectedProjectRepoIds: new Set(project.repositories.map((r) => r.id)),
      selectedProjectRepoPaths: new Set(project.repositories.map((r) => r.path)),
    }
  }, [projectFilter, projects])

  // Detect mobile for layout direction
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const direction: 'TB' | 'LR' = isMobile ? 'TB' : 'LR'

  // Calculate which nodes are blocked (have incomplete dependencies)
  const blockedNodes = useMemo(() => {
    if (!graphData) return new Set<string>()
    const blocked = new Set<string>()
    const completedStatuses = new Set(['DONE', 'CANCELED'])

    for (const edge of graphData.edges) {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source)
      if (sourceNode && !completedStatuses.has(sourceNode.status)) {
        blocked.add(edge.target)
      }
    }
    return blocked
  }, [graphData])

  // Calculate which nodes are blocking others
  const blockingNodes = useMemo(() => {
    if (!graphData) return new Set<string>()
    const blocking = new Set<string>()
    const completedStatuses = new Set(['DONE', 'CANCELED'])

    for (const edge of graphData.edges) {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source)
      if (sourceNode && !completedStatuses.has(sourceNode.status)) {
        blocking.add(edge.source)
      }
    }
    return blocking
  }, [graphData])

  // Helper to check if a task matches the project filter
  const taskMatchesProjectFilter = useCallback(
    (task: TaskGraphNode): boolean => {
      // Get full task data for repository info
      const fullTask = taskMap.get(task.id)
      if (!fullTask) return true // If no full data, don't filter out

      if (projectFilter === 'inbox') {
        // Show only tasks without a project (neither directly via projectId nor via repository)
        return (
          !fullTask.projectId &&
          (!fullTask.repositoryId || !projectRepoIds.has(fullTask.repositoryId)) &&
          (!fullTask.repoPath || !projectRepoPaths.has(fullTask.repoPath))
        )
      } else if (projectFilter) {
        // Show tasks for a specific project (either directly via projectId or via repository)
        return (
          fullTask.projectId === projectFilter ||
          (!!fullTask.repositoryId && selectedProjectRepoIds.has(fullTask.repositoryId)) ||
          (!!fullTask.repoPath && selectedProjectRepoPaths.has(fullTask.repoPath))
        )
      }
      return true // No filter applied
    },
    [projectFilter, projectRepoIds, projectRepoPaths, selectedProjectRepoIds, selectedProjectRepoPaths, taskMap]
  )

  // Helper to check if a task matches the tags filter (OR logic)
  const taskMatchesTagsFilter = useCallback(
    (task: TaskGraphNode): boolean => {
      if (!tagsFilter || tagsFilter.length === 0) return true
      // Task matches if it has ANY of the selected tags
      return task.tags.some((tag) => tagsFilter.includes(tag))
    },
    [tagsFilter]
  )

  // Convert API data to ReactFlow nodes and edges
  const { initialNodes, initialEdges } = useMemo((): { initialNodes: Node<TaskNodeData>[]; initialEdges: Edge[] } => {
    if (!graphData) return { initialNodes: [], initialEdges: [] }

    // First, determine which tasks match our filters
    const matchingTaskIds = new Set<string>()
    for (const task of graphData.nodes) {
      if (taskMatchesProjectFilter(task) && taskMatchesTagsFilter(task)) {
        matchingTaskIds.add(task.id)
      }
    }

    // Expand to include full dependency chains
    // Any task that is connected to a matching task should be included
    const nodesInFilteredChains = new Set<string>()
    for (const edge of graphData.edges) {
      const sourceMatches = matchingTaskIds.has(edge.source)
      const targetMatches = matchingTaskIds.has(edge.target)
      // Include the edge (and both nodes) if either end matches the filter
      if (sourceMatches || targetMatches) {
        nodesInFilteredChains.add(edge.source)
        nodesInFilteredChains.add(edge.target)
      }
    }

    // If no filters are applied, show all nodes in dependency chains
    const hasFilters = projectFilter || (tagsFilter && tagsFilter.length > 0)
    if (!hasFilters) {
      for (const edge of graphData.edges) {
        nodesInFilteredChains.add(edge.source)
        nodesInFilteredChains.add(edge.target)
      }
    }

    const filteredTasks = graphData.nodes.filter((task) => nodesInFilteredChains.has(task.id))

    // Filter edges to only include those where both nodes are in the filtered set
    const filteredEdges = graphData.edges.filter(
      (edge) => nodesInFilteredChains.has(edge.source) && nodesInFilteredChains.has(edge.target)
    )

    const nodes: Node<TaskNodeData>[] = filteredTasks.map((task) => ({
      id: task.id,
      type: 'task',
      position: { x: 0, y: 0 },
      data: {
        task,
        isBlocked: blockedNodes.has(task.id),
        isBlocking: blockingNodes.has(task.id),
        direction,
      },
    }))

    const edges: Edge[] = filteredEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
        color: '#6b7280',
      },
      style: {
        stroke: '#6b7280',
        strokeWidth: 2,
      },
    }))

    // Apply automatic layout (LR on desktop, TB on mobile)
    const layouted = getLayoutedElements(nodes, edges, direction)
    return { initialNodes: layouted.nodes as Node<TaskNodeData>[], initialEdges: layouted.edges }
  }, [graphData, blockedNodes, blockingNodes, direction, taskMatchesProjectFilter, taskMatchesTagsFilter, projectFilter, tagsFilter])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Update nodes and edges when data changes
  useEffect(() => {
    if (initialNodes.length > 0 || initialEdges.length > 0) {
      setNodes(initialNodes)
      setEdges(initialEdges)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<TaskNodeData>) => {
      const task = taskMap.get(node.id)
      if (!task) return

      // For code tasks, navigate to detail page
      // For non-code tasks, open the modal
      if (task.worktreePath) {
        navigate({
          to: '/tasks/$taskId',
          params: { taskId: node.id },
        })
      } else {
        setSelectedTask(task)
        setModalOpen(true)
      }
    },
    [navigate, taskMap]
  )

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <span className="text-muted-foreground">Loading dependency graph...</span>
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <span className="text-muted-foreground">No tasks found</span>
      </div>
    )
  }

  if (graphData.edges.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full gap-2 ${className}`}>
        <span className="text-muted-foreground">No dependencies defined</span>
        <span className="text-sm text-muted-foreground/70">
          Add dependencies between tasks to see the graph
        </span>
      </div>
    )
  }

  return (
    <>
      <div className={`h-full relative ${className}`}>
        {/* Info badge */}
        <div className="absolute top-2 left-2 z-10 bg-background/90 border rounded-md px-2 py-1 text-xs text-muted-foreground">
          {nodes.length} tasks with dependencies ({graphData.edges.length} links)
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e5e7eb" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as TaskNodeData
              return STATUS_COLORS[data.task.status].border
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            className="!bg-background/80"
          />
        </ReactFlow>
      </div>

      {/* Non-worktree task modal */}
      {selectedTask && !selectedTask.worktreePath && (
        <NonWorktreeTaskModal
          task={selectedTask}
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open)
            if (!open) setSelectedTask(null)
          }}
        />
      )}
    </>
  )
}
