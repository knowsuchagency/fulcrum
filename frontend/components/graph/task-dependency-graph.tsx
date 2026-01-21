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
import type { Task, TaskStatus } from '@/types'
import { NonCodeTaskModal } from '@/components/task/non-code-task-modal'
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
        {task.labels.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {task.labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600"
              >
                {label}
              </span>
            ))}
            {task.labels.length > 3 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600">
                +{task.labels.length - 3}
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
}

const MOBILE_BREAKPOINT = 768

export function TaskDependencyGraph({ className }: TaskDependencyGraphProps) {
  const navigate = useNavigate()
  const { data: graphData, isLoading } = useTaskDependencyGraph()
  const { data: allTasks = [] } = useTasks()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Create a map of task IDs to full task objects for quick lookup
  const taskMap = useMemo(() => {
    return new Map(allTasks.map((t) => [t.id, t]))
  }, [allTasks])

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

  // Convert API data to ReactFlow nodes and edges
  const { initialNodes, initialEdges } = useMemo((): { initialNodes: Node<TaskNodeData>[]; initialEdges: Edge[] } => {
    if (!graphData) return { initialNodes: [], initialEdges: [] }

    // Only include nodes that are part of dependency chains
    const nodesInChains = new Set<string>()
    for (const edge of graphData.edges) {
      nodesInChains.add(edge.source)
      nodesInChains.add(edge.target)
    }

    const filteredTasks = graphData.nodes.filter((task) => nodesInChains.has(task.id))

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

    const edges: Edge[] = graphData.edges.map((edge) => ({
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
  }, [graphData, blockedNodes, blockingNodes, direction])

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

      {/* Non-code task modal */}
      {selectedTask && !selectedTask.worktreePath && (
        <NonCodeTaskModal
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
