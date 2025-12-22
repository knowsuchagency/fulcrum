import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Terminal } from './terminal'
import { TerminalStatusBar } from './terminal-status'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PlusSignIcon, Task01Icon } from '@hugeicons/core-free-icons'
import { GitActionsButtons } from './git-actions-buttons'
import type { TerminalInfo } from '@/hooks/use-terminal-ws'
import type { Terminal as XTerm } from '@xterm/xterm'

interface TaskInfo {
  taskId: string
  repoId?: string
  repoName: string
  title: string
  repoPath: string
  worktreePath: string
  baseBranch: string
  branch: string | null
}

interface TerminalGridProps {
  terminals: TerminalInfo[]
  onTerminalClose?: (terminalId: string) => void
  onTerminalAdd?: () => void
  onTerminalReady?: (terminalId: string, xterm: XTerm) => void
  onTerminalResize?: (terminalId: string, cols: number, rows: number) => void
  onTerminalRename?: (terminalId: string, name: string) => void
  onTerminalContainerReady?: (terminalId: string, container: HTMLDivElement) => void
  /** Map terminal cwd to task info for navigation and display */
  taskInfoByCwd?: Map<string, TaskInfo>
}

interface TerminalPaneProps {
  terminal: TerminalInfo
  taskInfo?: TaskInfo
  onClose?: () => void
  onReady?: (xterm: XTerm) => void
  onResize?: (cols: number, rows: number) => void
  onRename?: (name: string) => void
  onContainerReady?: (container: HTMLDivElement) => void
}

function TerminalPane({ terminal, taskInfo, onClose, onReady, onResize, onRename, onContainerReady }: TerminalPaneProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card">
        {taskInfo ? (
          // Task terminal header: [Task Link] [Repo Name] [Path] ... [Git Actions] [Close]
          <div className="flex flex-1 items-center gap-2 px-2 py-1">
            <Link
              to="/tasks/$taskId"
              params={{ taskId: taskInfo.taskId }}
              className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 truncate"
            >
              <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{taskInfo.title}</span>
            </Link>
            <Link
              to={taskInfo.repoId ? '/repositories/$repoId' : '/repositories'}
              params={taskInfo.repoId ? { repoId: taskInfo.repoId } : undefined}
              className="text-xs font-medium text-foreground shrink-0 cursor-pointer hover:underline"
            >
              {taskInfo.repoName}
            </Link>
            {terminal.cwd && (
              <span className="text-xs text-muted-foreground truncate">{terminal.cwd.split('/').pop()}</span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <GitActionsButtons
                repoPath={taskInfo.repoPath}
                worktreePath={taskInfo.worktreePath}
                baseBranch={taskInfo.baseBranch}
                taskId={taskInfo.taskId}
              />
            </div>
          </div>
        ) : (
          // Regular terminal header
          <TerminalStatusBar
            name={terminal.name}
            status={terminal.status}
            exitCode={terminal.exitCode}
            className="flex-1 border-b-0"
            onRename={onRename}
          />
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="mr-1 h-5 w-5 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          </Button>
        )}
      </div>
      <div className="flex-1">
        <Terminal onReady={onReady} onResize={onResize} onContainerReady={onContainerReady} />
      </div>
    </div>
  )
}

function EmptyPane({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
      {onAdd ? (
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-2">
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
          New Terminal
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No terminals</p>
      )}
    </div>
  )
}

function getGridLayout(count: number): { rows: number; cols: number } {
  if (count <= 1) return { rows: 1, cols: 1 }
  if (count <= 2) return { rows: 1, cols: 2 }
  if (count <= 4) return { rows: 2, cols: 2 }
  if (count <= 6) return { rows: 2, cols: 3 }
  if (count <= 9) return { rows: 3, cols: 3 }
  return { rows: 3, cols: 4 } // max 12
}

export function TerminalGrid({
  terminals,
  onTerminalClose,
  onTerminalAdd,
  onTerminalReady,
  onTerminalResize,
  onTerminalRename,
  onTerminalContainerReady,
  taskInfoByCwd,
}: TerminalGridProps) {
  if (terminals.length === 0) {
    return <EmptyPane onAdd={onTerminalAdd} />
  }

  const { rows, cols } = getGridLayout(terminals.length)

  // Group terminals into rows
  const terminalRows: TerminalInfo[][] = []
  for (let i = 0; i < rows; i++) {
    const rowStart = i * cols
    const rowEnd = Math.min(rowStart + cols, terminals.length)
    if (rowStart < terminals.length) {
      terminalRows.push(terminals.slice(rowStart, rowEnd))
    }
  }

  const renderTerminalPane = (terminal: TerminalInfo) => (
    <TerminalPane
      terminal={terminal}
      taskInfo={terminal.cwd ? taskInfoByCwd?.get(terminal.cwd) : undefined}
      onClose={onTerminalClose ? () => onTerminalClose(terminal.id) : undefined}
      onReady={onTerminalReady ? (xterm) => onTerminalReady(terminal.id, xterm) : undefined}
      onResize={onTerminalResize ? (c, r) => onTerminalResize(terminal.id, c, r) : undefined}
      onRename={onTerminalRename ? (name) => onTerminalRename(terminal.id, name) : undefined}
      onContainerReady={onTerminalContainerReady ? (container) => onTerminalContainerReady(terminal.id, container) : undefined}
    />
  )

  // Single terminal - no resizable panels needed
  if (terminals.length === 1) {
    return <div className="h-full">{renderTerminalPane(terminals[0])}</div>
  }

  // Two terminals - horizontal split
  if (terminals.length === 2) {
    return (
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel key={terminals[0].id} defaultSize={50} minSize={15}>
          {renderTerminalPane(terminals[0])}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel key={terminals[1].id} defaultSize={50} minSize={15}>
          {renderTerminalPane(terminals[1])}
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  // Three terminals - 1 left, 2 stacked right
  if (terminals.length === 3) {
    return (
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel key={terminals[0].id} defaultSize={50} minSize={15}>
          {renderTerminalPane(terminals[0])}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={15}>
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel key={terminals[1].id} defaultSize={50} minSize={15}>
              {renderTerminalPane(terminals[1])}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel key={terminals[2].id} defaultSize={50} minSize={15}>
              {renderTerminalPane(terminals[2])}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  // Four+ terminals - grid layout
  // Multiple rows with nested horizontal panels
  return (
    <ResizablePanelGroup direction="vertical" className="h-full">
      {terminalRows.map((row, rowIndex) => (
        <Fragment key={`row-${rowIndex}`}>
          {rowIndex > 0 && <ResizableHandle />}
          <ResizablePanel defaultSize={100 / terminalRows.length} minSize={15}>
            {row.length === 1 ? (
              renderTerminalPane(row[0])
            ) : (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                {row.map((terminal, colIndex) => (
                  <Fragment key={terminal.id}>
                    {colIndex > 0 && <ResizableHandle />}
                    <ResizablePanel defaultSize={100 / cols} minSize={15}>
                      {renderTerminalPane(terminal)}
                    </ResizablePanel>
                  </Fragment>
                ))}
              </ResizablePanelGroup>
            )}
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  )
}
