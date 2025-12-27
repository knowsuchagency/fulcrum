// Shared types for WebSocket terminal protocol

export type TerminalStatus = 'running' | 'exited' | 'error'

// Tab info - tabs are first-class entities
export interface TabInfo {
  id: string
  name: string
  position: number
  directory?: string // Optional default directory for terminals in this tab
  createdAt: number
}

// Terminal info - terminals can optionally belong to a tab
export interface TerminalInfo {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  exitCode?: number
  cols: number
  rows: number
  createdAt: number
  tabId?: string // Which tab this terminal belongs to (nullable)
  positionInTab?: number // Order within the tab
}

/**
 * Base interface for messages that support request correlation.
 * The server echoes requestId back in responses for optimistic update confirmation.
 */
interface RequestCorrelation {
  /** Client-generated ID for correlating request with response */
  requestId?: string
  /** Temporary client-side ID for optimistic entity creation */
  tempId?: string
}

// Client -> Server messages

// Terminal messages
export interface TerminalCreateMessage {
  type: 'terminal:create'
  payload: {
    name: string
    cols: number
    rows: number
    cwd?: string
    tabId?: string // Assign to tab on creation
    positionInTab?: number
  } & RequestCorrelation
}

export interface TerminalDestroyMessage {
  type: 'terminal:destroy'
  payload: {
    terminalId: string
    /**
     * Required when destroying a terminal that belongs to a tab.
     * Tab terminals should only be destroyed by explicit user action.
     */
    force?: boolean
    /**
     * Reason for deletion (for audit logging).
     * Examples: 'user_closed', 'tab_deleted', 'task_cleanup'
     */
    reason?: string
  }
}

export interface TerminalInputMessage {
  type: 'terminal:input'
  payload: {
    terminalId: string
    data: string
  }
}

export interface TerminalResizeMessage {
  type: 'terminal:resize'
  payload: {
    terminalId: string
    cols: number
    rows: number
  }
}

export interface TerminalAttachMessage {
  type: 'terminal:attach'
  payload: {
    terminalId: string
  }
}

export interface TerminalsListMessage {
  type: 'terminals:list'
}

export interface TerminalRenameMessage {
  type: 'terminal:rename'
  payload: {
    terminalId: string
    name: string
  }
}

export interface TerminalAssignTabMessage {
  type: 'terminal:assignTab'
  payload: {
    terminalId: string
    tabId: string | null // null to unassign
    positionInTab?: number
  }
}

export interface TerminalClearBufferMessage {
  type: 'terminal:clearBuffer'
  payload: {
    terminalId: string
  }
}

// Tab messages
export interface TabCreateMessage {
  type: 'tab:create'
  payload: {
    name: string
    position?: number
    directory?: string
  } & RequestCorrelation
}

export interface TabUpdateMessage {
  type: 'tab:update'
  payload: {
    tabId: string
    name?: string
    directory?: string | null // null to clear directory
  }
}

export interface TabDeleteMessage {
  type: 'tab:delete'
  payload: {
    tabId: string
  }
}

export interface TabReorderMessage {
  type: 'tab:reorder'
  payload: {
    tabId: string
    position: number
  }
}

export interface TabsListMessage {
  type: 'tabs:list'
}

export type ClientMessage =
  | TerminalCreateMessage
  | TerminalDestroyMessage
  | TerminalInputMessage
  | TerminalResizeMessage
  | TerminalAttachMessage
  | TerminalsListMessage
  | TerminalRenameMessage
  | TerminalAssignTabMessage
  | TerminalClearBufferMessage
  | TabCreateMessage
  | TabUpdateMessage
  | TabDeleteMessage
  | TabReorderMessage
  | TabsListMessage

// Server -> Client messages

export interface TerminalCreatedMessage {
  type: 'terminal:created'
  payload: {
    terminal: TerminalInfo
    isNew: boolean // true if newly created, false if returning existing terminal
    /** Echo of client requestId for optimistic update confirmation */
    requestId?: string
    /** Client's temporary ID that should be replaced with terminal.id */
    tempId?: string
  }
}

export interface TerminalOutputMessage {
  type: 'terminal:output'
  payload: {
    terminalId: string
    data: string
  }
}

export interface TerminalExitMessage {
  type: 'terminal:exit'
  payload: {
    terminalId: string
    exitCode: number
  }
}

export interface TerminalAttachedMessage {
  type: 'terminal:attached'
  payload: {
    terminalId: string
    buffer: string
  }
}

export interface TerminalsListResponseMessage {
  type: 'terminals:list'
  payload: {
    terminals: TerminalInfo[]
  }
}

export interface TerminalErrorMessage {
  type: 'terminal:error'
  payload: {
    terminalId?: string
    error: string
    /** Echo of client requestId for optimistic update rollback */
    requestId?: string
    /** Client's temporary ID that should be rolled back */
    tempId?: string
  }
}

export interface TerminalRenamedMessage {
  type: 'terminal:renamed'
  payload: {
    terminalId: string
    name: string
  }
}

export interface TerminalDestroyedMessage {
  type: 'terminal:destroyed'
  payload: {
    terminalId: string
  }
}

export interface TerminalTabAssignedMessage {
  type: 'terminal:tabAssigned'
  payload: {
    terminalId: string
    tabId: string | null
    positionInTab: number
  }
}

export interface TerminalBufferClearedMessage {
  type: 'terminal:bufferCleared'
  payload: {
    terminalId: string
  }
}

// Tab response messages
export interface TabCreatedMessage {
  type: 'tab:created'
  payload: {
    tab: TabInfo
    /** Echo of client requestId for optimistic update confirmation */
    requestId?: string
    /** Client's temporary ID that should be replaced with tab.id */
    tempId?: string
  }
}

export interface TabUpdatedMessage {
  type: 'tab:updated'
  payload: {
    tabId: string
    name?: string
    directory?: string | null
  }
}

export interface TabDeletedMessage {
  type: 'tab:deleted'
  payload: {
    tabId: string
  }
}

export interface TabReorderedMessage {
  type: 'tab:reordered'
  payload: {
    tabId: string
    position: number
  }
}

export interface TabsListResponseMessage {
  type: 'tabs:list'
  payload: {
    tabs: TabInfo[]
  }
}

export interface TaskUpdatedMessage {
  type: 'task:updated'
  payload: {
    taskId: string
  }
}

export interface NotificationMessage {
  type: 'notification'
  payload: {
    id: string
    title: string
    message: string
    notificationType: 'success' | 'info' | 'warning' | 'error'
    taskId?: string
    playSound?: boolean // Tell desktop app to play local sound
  }
}

export type ServerMessage =
  | TerminalCreatedMessage
  | TerminalOutputMessage
  | TerminalExitMessage
  | TerminalAttachedMessage
  | TerminalBufferClearedMessage
  | TerminalsListResponseMessage
  | TerminalErrorMessage
  | TerminalRenamedMessage
  | TerminalDestroyedMessage
  | TerminalTabAssignedMessage
  | TabCreatedMessage
  | TabUpdatedMessage
  | TabDeletedMessage
  | TabReorderedMessage
  | TabsListResponseMessage
  | TaskUpdatedMessage
  | NotificationMessage
