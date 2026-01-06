import { Fragment, useState, useEffect } from 'react'
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
import { Cancel01Icon, PlusSignIcon, Loading03Icon, Maximize02Icon, ArrowShrink02Icon } from '@hugeicons/core-free-icons'
import { TaskTerminalHeader } from './task-terminal-header'
import { ProjectTerminalHeader } from './project-terminal-header'
import type { TerminalInfo } from '@/hooks/use-terminal-ws'
import type { Terminal as XTerm } from '@xterm/xterm'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MobileTerminalControls } from './mobile-terminal-controls'
import { MobileTerminalSelector } from './mobile-terminal-selector'
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
  pinned?: boolean
}

interface ProjectInfo {
  projectId: string
  projectName: string
  repoPath: string
  appStatus: string | null
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
  /** Map terminal cwd to project info for navigation and display */
  projectInfoByCwd?: Map<string, ProjectInfo>
  /** Custom message to show when there are no terminals */
  emptyMessage?: string
}

interface TerminalPaneProps {
  terminal: TerminalInfo
  taskInfo?: TaskInfo
  projectInfo?: ProjectInfo
  isMobile?: boolean
  onClose?: () => void
  onReady?: (xterm: XTerm) => void
  onResize?: (cols: number, rows: number) => void
  onRename?: (name: string) => void
  onContainerReady?: (container: HTMLDivElement) => void
  setupImagePaste?: (container: HTMLElement, terminalId: string) => () => void
  onFocus?: () => void
  isMaximized?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
  canMaximize?: boolean
}

const TerminalPane = observer(function TerminalPane({ terminal, taskInfo, projectInfo, isMobile, onClose, onReady, onResize, onRename, onContainerReady, setupImagePaste, onFocus, sendInputToTerminal, isMaximized, onMaximize, onMinimize, canMaximize }: TerminalPaneProps & { sendInputToTerminal?: (terminalId: string, text: string) => void }) {
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

  // Render appropriate header based on context
  const renderHeader = () => {
    if (taskInfo) {
      return (
        <TaskTerminalHeader
          taskInfo={taskInfo}
          terminalId={terminal.id}
          terminalCwd={terminal.cwd}
          isMobile={isMobile}
          sendInputToTerminal={sendInputToTerminal}
        />
      )
    }
    if (projectInfo) {
      return <ProjectTerminalHeader projectInfo={projectInfo} />
    }
    return (
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card">
        <TerminalStatusBar
          name={terminal.name}
          status={terminal.status}
          exitCode={terminal.exitCode}
          className="flex-1 border-b-0"
          onRename={onRename}
        />
        <div className="flex items-center gap-1 mr-1">
          {canMaximize && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={isMaximized ? onMinimize : onMaximize}
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <HugeiconsIcon
                icon={isMaximized ? ArrowShrink02Icon : Maximize02Icon}
                size={12}
                strokeWidth={2}
              />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {renderHeader()}
      <div className="relative min-h-0 min-w-0 flex-1">
        <Terminal onReady={onReady} onResize={onResize} onContainerReady={onContainerReady} terminalId={terminal.id} setupImagePaste={setupImagePaste} onFocus={onFocus} />
        {/* Loading overlay - shown while Claude is starting */}
        {isStartingClaude && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-terminal-background/90">
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

function EmptyPane({ onAdd, message }: { onAdd?: () => void; message?: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-terminal-background">
      {onAdd ? (
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-2">
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
          New Terminal
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{message || 'No terminals'}</p>
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
  projectInfoByCwd,
  emptyMessage,
}: TerminalGridProps) {
  const isMobile = useIsMobile()
  const [focusedTerminalId, setFocusedTerminalId] = useState<string | null>(
    terminals.length > 0 ? terminals[0].id : null
  )
  // Track active terminal index for mobile single-terminal view
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0)
  // Track maximized terminal (only for regular terminals, not task terminals)
  const [maximizedTerminalId, setMaximizedTerminalId] = useState<string | null>(null)

  // Keep mobile active index in bounds when terminals change
  useEffect(() => {
    if (mobileActiveIndex >= terminals.length && terminals.length > 0) {
      setMobileActiveIndex(terminals.length - 1)
    }
  }, [terminals.length, mobileActiveIndex])

  // Clear maximized state when terminal is removed
  useEffect(() => {
    if (maximizedTerminalId && !terminals.find(t => t.id === maximizedTerminalId)) {
      setMaximizedTerminalId(null)
    }
  }, [terminals, maximizedTerminalId])

  if (terminals.length === 0) {
    return <EmptyPane onAdd={onTerminalAdd} message={emptyMessage} />
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
    // On mobile with multiple terminals, use the selected terminal from the selector
    const targetTerminalId = isMobile && terminals.length > 1
      ? terminals[mobileActiveIndex]?.id
      : focusedTerminalId
    if (targetTerminalId && writeToTerminal) {
      writeToTerminal(targetTerminalId, data)
    }
  }

  const renderTerminalPane = (terminal: TerminalInfo) => {
    const taskInfo = terminal.cwd ? taskInfoByCwd?.get(terminal.cwd) : undefined
    const projectInfo = terminal.cwd ? projectInfoByCwd?.get(terminal.cwd) : undefined
    // Only regular terminals (not task/project terminals) can be maximized when there are multiple terminals
    const canMaximize = !taskInfo && !projectInfo && terminals.length > 1
    return (
      <TerminalPane
        terminal={terminal}
        taskInfo={taskInfo}
        projectInfo={projectInfo}
        isMobile={isMobile}
        onClose={onTerminalClose ? () => onTerminalClose(terminal.id) : undefined}
        onReady={onTerminalReady ? (xterm) => onTerminalReady(terminal.id, xterm) : undefined}
        onResize={onTerminalResize ? (c, r) => onTerminalResize(terminal.id, c, r) : undefined}
        onRename={onTerminalRename ? (name) => onTerminalRename(terminal.id, name) : undefined}
        onContainerReady={onTerminalContainerReady ? (container) => onTerminalContainerReady(terminal.id, container) : undefined}
        setupImagePaste={setupImagePaste}
        onFocus={() => setFocusedTerminalId(terminal.id)}
        sendInputToTerminal={sendInputToTerminal}
        isMaximized={maximizedTerminalId === terminal.id}
        onMaximize={() => setMaximizedTerminalId(terminal.id)}
        onMinimize={() => setMaximizedTerminalId(null)}
        canMaximize={canMaximize}
      />
    )
  }

  // Wrapper to add shared mobile controls
  const withMobileControls = (content: React.ReactNode) => (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">{content}</div>
      {isMobile && writeToTerminal && <MobileTerminalControls onSend={handleMobileSend} />}
    </div>
  )

  // Mobile view with multiple terminals: show one terminal at a time with selector
  if (isMobile && terminals.length > 1) {
    const activeTerminal = terminals[mobileActiveIndex] ?? terminals[0]
    return (
      <div className="flex h-full w-full flex-col">
        <MobileTerminalSelector
          terminals={terminals}
          activeIndex={mobileActiveIndex}
          onSelect={setMobileActiveIndex}
          taskInfoByCwd={taskInfoByCwd}
        />
        <div key={activeTerminal.id} className="min-h-0 flex-1">
          {renderTerminalPane(activeTerminal)}
        </div>
        {writeToTerminal && <MobileTerminalControls onSend={handleMobileSend} />}
      </div>
    )
  }

  // Single terminal - no resizable panels needed
  // Key is critical: forces React to unmount/remount Terminal when switching tabs
  if (terminals.length === 1) {
    return withMobileControls(
      <div key={terminals[0].id} className="h-full w-full max-w-full min-w-0 overflow-hidden">{renderTerminalPane(terminals[0])}</div>
    )
  }

  // Maximized terminal - show only that terminal at full size
  if (maximizedTerminalId) {
    const maximizedTerminal = terminals.find(t => t.id === maximizedTerminalId)
    if (maximizedTerminal) {
      return withMobileControls(
        <div key={maximizedTerminal.id} className="h-full w-full max-w-full min-w-0 overflow-hidden">{renderTerminalPane(maximizedTerminal)}</div>
      )
    }
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
