// Shared types for WebSocket terminal protocol

export type TerminalStatus = 'running' | 'exited' | 'error'

export interface TerminalInfo {
  id: string
  name: string
  cwd: string
  status: TerminalStatus
  exitCode?: number
  cols: number
  rows: number
  createdAt: number
}

// Client -> Server messages
export interface TerminalCreateMessage {
  type: 'terminal:create'
  payload: {
    name: string
    cols: number
    rows: number
    cwd?: string
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

export type ClientMessage =
  | TerminalCreateMessage
  | TerminalDestroyMessage
  | TerminalInputMessage
  | TerminalResizeMessage
  | TerminalAttachMessage
  | TerminalsListMessage
  | TerminalRenameMessage

// Server -> Client messages
export interface TerminalCreatedMessage {
  type: 'terminal:created'
  payload: {
    terminal: TerminalInfo
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

export interface TaskUpdatedMessage {
  type: 'task:updated'
  payload: {
    taskId: string
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
  | TaskUpdatedMessage
