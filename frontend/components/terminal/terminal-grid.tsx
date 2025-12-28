import { Fragment, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { observer } from 'mobx-react-lite'
import { log } from '@/lib/logger'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Terminal } from './terminal'
import { TerminalStatusBar } from './terminal-status'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PlusSignIcon, Task01Icon, LibraryIcon, GitBranchIcon, Loading03Icon } from '@hugeicons/core-free-icons'
import { GitActionsButtons } from './git-actions-buttons'
import type { TerminalInfo } from '@/hooks/use-terminal-ws'
import type { Terminal as XTerm } from '@xterm/xterm'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { GitStatusBadge } from '@/components/viewer/git-status-badge'
import { useStore } from '@/stores'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface TaskInfo {
  taskId: string
  repoId?: string
  repoName: string
  title: string
  repoPath: string
  worktreePath: string
  baseBranch: string
  branch: string | null
  prUrl?: string | null
}

interface TerminalGridProps {
  terminals: TerminalInfo[]
  onTerminalClose?: (terminalId: string) => void
  onTerminalAdd?: () => void
  onTerminalReady?: (terminalId: string, xterm: XTerm) => void
  onTerminalResize?: (terminalId: string, cols: number, rows: number) => void
  onTerminalRename?: (terminalId: string, name: string) => void
  onTerminalContainerReady?: (terminalId: string, container: HTMLDivElement) => void
  setupImagePaste?: (container: HTMLElement, terminalId: string) => () => void
  writeToTerminal?: (terminalId: string, data: string) => void
  sendInputToTerminal?: (terminalId: string, text: string) => void
  /** Map terminal cwd to task info for navigation and display */
  taskInfoByCwd?: Map<string, TaskInfo>
}

interface TerminalPaneProps {
  terminal: TerminalInfo
  taskInfo?: TaskInfo
  isMobile?: boolean
  onClose?: () => void
  onReady?: (xterm: XTerm) => void
  onResize?: (cols: number, rows: number) => void
  onRename?: (name: string) => void
  onContainerReady?: (container: HTMLDivElement) => void
  setupImagePaste?: (container: HTMLElement, terminalId: string) => () => void
  onFocus?: () => void
}

const TerminalPane = observer(function TerminalPane({ terminal, taskInfo, isMobile, onClose, onReady, onResize, onRename, onContainerReady, setupImagePaste, onFocus, sendInputToTerminal }: TerminalPaneProps & { sendInputToTerminal?: (terminalId: string, text: string) => void }) {
  const store = useStore()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Get the observable isStartingUp state from the terminal model (only for task terminals)
  // This is reactive because TerminalPane is wrapped with observer()
  const terminalModel = taskInfo ? store.terminals.get(terminal.id) : null
  const isStartingClaude = terminalModel?.isStartingUp ?? false

  // Debug logging to trace isStartingUp state
  useEffect(() => {
    if (taskInfo) {
      log.terminal.info('TerminalPane isStartingUp check', {
        terminalId: terminal.id,
        hasTaskInfo: !!taskInfo,
        hasTerminalModel: !!terminalModel,
        isStartingUp: terminalModel?.isStartingUp,
        isStartingClaude,
      })
    }
  }, [terminal.id, taskInfo, terminalModel, isStartingClaude, terminalModel?.isStartingUp])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card">
        {taskInfo ? (
          // Task terminal header: [Task Link] [Repo Name] [Path] ... [Git Actions] [Close]
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
            <Link
              to="/tasks/$taskId"
              params={{ taskId: taskInfo.taskId }}
              className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 truncate"
            >
              <HugeiconsIcon icon={Task01Icon} size={14} strokeWidth={2} className="shrink-0" />
              <span className="truncate">{taskInfo.title}</span>
            </Link>
            {!isMobile && (
              <>
                <Link
                  to={taskInfo.repoId ? '/repositories/$repoId' : '/repositories'}
                  params={taskInfo.repoId ? { repoId: taskInfo.repoId } : undefined}
                  className="flex items-center gap-1 text-xs font-medium text-foreground shrink-0 cursor-pointer hover:underline"
                >
                  <HugeiconsIcon icon={LibraryIcon} size={12} strokeWidth={2} className="shrink-0" />
                  {taskInfo.repoName}
                </Link>
                {terminal.cwd && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={2} className="shrink-0" />
                    {terminal.cwd.split('/').pop()}
                  </span>
                )}
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              <GitStatusBadge worktreePath={taskInfo.worktreePath} />
              <GitActionsButtons
                repoPath={taskInfo.repoPath}
                worktreePath={taskInfo.worktreePath}
                baseBranch={taskInfo.baseBranch}
                taskId={taskInfo.taskId}
                isMobile={isMobile}
                terminalId={terminal.id}
                sendInputToTerminal={sendInputToTerminal}
              />
            </div>
          </div>
        ) : (
          // Regular terminal header
          <>
            <TerminalStatusBar
              name={terminal.name}
              status={terminal.status}
              exitCode={terminal.exitCode}
              className="flex-1 border-b-0"
              onRename={onRename}
            />
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
          </>
        )}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">
        <Terminal onReady={onReady} onResize={onResize} onContainerReady={onContainerReady} terminalId={terminal.id} setupImagePaste={setupImagePaste} onFocus={onFocus} />
        {/* Loading overlay - shown while Claude is starting */}
        {isStartingClaude && (
          <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-terminal-background/90">
            <div className="flex flex-col items-center gap-3">
              <HugeiconsIcon
                icon={Loading03Icon}
                size={24}
                strokeWidth={2}
                className={cn('animate-spin', isDark ? 'text-white/60' : 'text-black/60')}
              />
              <span className={cn('font-mono text-sm', isDark ? 'text-white/60' : 'text-black/60')}>
                Starting Claude Code...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

function EmptyPane({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-terminal-background">
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
  setupImagePaste,
  writeToTerminal,
  sendInputToTerminal,
  taskInfoByCwd,
}: TerminalGridProps) {
  const isMobile = useIsMobile()
  const [focusedTerminalId, setFocusedTerminalId] = useState<string | null>(
    terminals.length > 0 ? terminals[0].id : null
  )

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

  const handleMobileSend = (data: string) => {
    if (focusedTerminalId && writeToTerminal) {
      writeToTerminal(focusedTerminalId, data)
    }
  }

  const renderTerminalPane = (terminal: TerminalInfo) => (
    <TerminalPane
      terminal={terminal}
      taskInfo={terminal.cwd ? taskInfoByCwd?.get(terminal.cwd) : undefined}
      isMobile={isMobile}
      onClose={onTerminalClose ? () => onTerminalClose(terminal.id) : undefined}
      onReady={onTerminalReady ? (xterm) => onTerminalReady(terminal.id, xterm) : undefined}
      onResize={onTerminalResize ? (c, r) => onTerminalResize(terminal.id, c, r) : undefined}
      onRename={onTerminalRename ? (name) => onTerminalRename(terminal.id, name) : undefined}
      onContainerReady={onTerminalContainerReady ? (container) => onTerminalContainerReady(terminal.id, container) : undefined}
      setupImagePaste={setupImagePaste}
      onFocus={() => setFocusedTerminalId(terminal.id)}
      sendInputToTerminal={sendInputToTerminal}
    />
  )

  // Wrapper to add shared mobile controls
  const withMobileControls = (content: React.ReactNode) => (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">{content}</div>
      {isMobile && writeToTerminal && <MobileTerminalControls onSend={handleMobileSend} />}
    </div>
  )

  // Single terminal - no resizable panels needed
  if (terminals.length === 1) {
    return withMobileControls(
      <div className="h-full w-full max-w-full min-w-0 overflow-hidden">{renderTerminalPane(terminals[0])}</div>
    )
  }

  // Two terminals - vertical on mobile, horizontal on desktop
  if (terminals.length === 2) {
    return withMobileControls(
      <ResizablePanelGroup direction={isMobile ? 'vertical' : 'horizontal'} className="h-full max-w-full">
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
    return withMobileControls(
      <ResizablePanelGroup direction="horizontal" className="h-full max-w-full">
        <ResizablePanel key={terminals[0].id} defaultSize={50} minSize={15}>
          {renderTerminalPane(terminals[0])}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={15}>
          <ResizablePanelGroup direction="vertical" className="h-full max-w-full">
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
  return withMobileControls(
    <ResizablePanelGroup direction="vertical" className="h-full max-w-full">
      {terminalRows.map((row, rowIndex) => (
        <Fragment key={`row-${rowIndex}`}>
          {rowIndex > 0 && <ResizableHandle />}
          <ResizablePanel defaultSize={100 / terminalRows.length} minSize={15}>
            {row.length === 1 ? (
              renderTerminalPane(row[0])
            ) : (
              <ResizablePanelGroup direction="horizontal" className="h-full max-w-full">
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
