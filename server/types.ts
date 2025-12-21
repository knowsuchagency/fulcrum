// Shared types for WebSocket terminal protocol

export type TerminalStatus = 'running' | 'exited' | 'error'

// Tab info - tabs are first-class entities
export interface TabInfo {
  id: string
  name: string
  position: number
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
  }
}

export interface TerminalDestroyMessage {
  type: 'terminal:destroy'
  payload: {
    terminalId: string
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

// Tab messages
export interface TabCreateMessage {
  type: 'tab:create'
  payload: {
    name: string
    position?: number
  }
}

export interface TabRenameMessage {
  type: 'tab:rename'
  payload: {
    tabId: string
    name: string
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
  | TabCreateMessage
  | TabRenameMessage
  | TabDeleteMessage
  | TabReorderMessage
  | TabsListMessage

// Server -> Client messages

export interface TerminalCreatedMessage {
  type: 'terminal:created'
  payload: {
    terminal: TerminalInfo
    isNew: boolean // true if newly created, false if returning existing terminal
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

// Tab response messages
export interface TabCreatedMessage {
  type: 'tab:created'
  payload: {
    tab: TabInfo
  }
}

export interface TabRenamedMessage {
  type: 'tab:renamed'
  payload: {
    tabId: string
    name: string
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
  }
}

export type ServerMessage =
  | TerminalCreatedMessage
  | TerminalOutputMessage
  | TerminalExitMessage
  | TerminalAttachedMessage
  | TerminalsListResponseMessage
  | TerminalErrorMessage
  | TerminalRenamedMessage
  | TerminalDestroyedMessage
  | TerminalTabAssignedMessage
  | TabCreatedMessage
  | TabRenamedMessage
  | TabDeletedMessage
  | TabReorderedMessage
  | TabsListResponseMessage
  | TaskUpdatedMessage
  | NotificationMessage
