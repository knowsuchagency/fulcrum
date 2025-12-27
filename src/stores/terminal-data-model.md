# Terminal State Data Model

This document describes the MobX State Tree (MST) data model used for terminal and tab state management.

## Store Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          StoreProvider                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                        RootStore                               │  │
│  │                                                                │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │  │
│  │  │  TerminalsStore │  │    TabsStore    │  │   ViewState   │  │  │
│  │  │                 │  │                 │  │               │  │  │
│  │  │  items: [       │  │  items: [       │  │ focusedTerms  │  │  │
│  │  │    Terminal,    │  │    Tab,         │  │ currentView   │  │  │
│  │  │    Terminal,    │  │    Tab,         │  │ currentTaskId │  │  │
│  │  │    ...          │  │    ...          │  │ isTabVisible  │  │  │
│  │  │  ]              │  │  ]              │  │               │  │  │
│  │  └─────────────────┘  └─────────────────┘  └───────────────┘  │  │
│  │                                                                │  │
│  │  volatile:                                                     │  │
│  │    connected: boolean                                          │  │
│  │    initialized: boolean                                        │  │
│  │    newTerminalIds: Set<string>                                 │  │
│  │    pendingUpdates: Map<string, inverse>                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Environment (injected):                                             │
│    send: (message) => void  ─────────────────────► WebSocket        │
│    log: Logger                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Entity Relationships

```
                    ┌────────────────┐
                    │      Tab       │
                    │                │
                    │  id            │
                    │  name          │
                    │  position      │
                    │  directory     │◄─── Default cwd for new terminals
                    │  createdAt     │
                    └───────┬────────┘
                            │
                            │ 1:N (computed view)
                            │ terminals.filter(t => t.tabId === id)
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                         Terminal                                │
│                                                                 │
│  id ─────────────────────────────────────────► Primary key      │
│  name                                                           │
│  cwd ────────────────────────────────────────► Working dir      │
│  status ─────────────────────────────────────► running|exited   │
│  exitCode                                                       │
│  cols, rows ─────────────────────────────────► Dimensions       │
│  createdAt                                                      │
│  tabId ──────────────────────────────────────► FK to Tab (opt)  │
│  positionInTab ──────────────────────────────► Order in tab     │
│                                                                 │
│  volatile (non-persisted):                                      │
│    xterm: XTerm ─────────────────────────────► xterm.js inst    │
│    attachCleanup: () => void                                    │
│    isPending: boolean                                           │
│    pendingId: string                                            │
└────────────────────────────────────────────────────────────────┘
```

## Terminal Types

```
                    Terminals
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
   ┌──────────────┐           ┌──────────────┐
   │ Tab Terminal │           │Task Terminal │
   │              │           │              │
   │ tabId: set   │           │ tabId: null  │
   │              │           │              │
   │ Belongs to a │           │ Associated   │
   │ regular tab  │           │ with a task  │
   │              │           │ worktree     │
   │ Protected by │           │              │
   │ force flag   │           │ Subject to   │
   │              │           │ orphan       │
   │              │           │ cleanup      │
   └──────────────┘           └──────────────┘
```

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │     │  MST Store  │     │   Server    │
│  Component  │     │             │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  useStore()       │                   │
       │──────────────────►│                   │
       │                   │                   │
       │  Action call      │                   │
       │  (createTerminal) │                   │
       │──────────────────►│                   │
       │                   │                   │
       │                   │  WebSocket send   │
       │                   │──────────────────►│
       │                   │                   │
       │                   │                   │ Persist to DB
       │                   │                   │ Broadcast to
       │                   │                   │ all clients
       │                   │                   │
       │                   │  WebSocket msg    │
       │                   │◄──────────────────│
       │                   │                   │
       │                   │  handleMessage()  │
       │                   │  Update state     │
       │                   │                   │
       │  MobX reactivity  │                   │
       │◄──────────────────│                   │
       │                   │                   │
       │  Re-render        │                   │
       │                   │                   │
       ▼                   ▼                   ▼
```

## WebSocket Message Types

### Client → Server

```
┌─────────────────────────────────────────────────────────────┐
│ Terminal Messages                                            │
├─────────────────────────────────────────────────────────────┤
│ terminal:create    { name, cols, rows, cwd?, tabId?,        │
│                      requestId?, tempId? }                  │
│ terminal:destroy   { terminalId, force?, reason? }          │
│ terminal:input     { terminalId, data }                     │
│ terminal:resize    { terminalId, cols, rows }               │
│ terminal:attach    { terminalId }                           │
│ terminal:rename    { terminalId, name }                     │
│ terminal:assignTab { terminalId, tabId, positionInTab? }    │
│ terminal:clearBuffer { terminalId }                         │
├─────────────────────────────────────────────────────────────┤
│ Tab Messages                                                 │
├─────────────────────────────────────────────────────────────┤
│ tab:create         { name, position?, directory?,           │
│                      requestId?, tempId? }                  │
│ tab:update         { tabId, name?, directory? }             │
│ tab:delete         { tabId }                                │
│ tab:reorder        { tabId, position }                      │
└─────────────────────────────────────────────────────────────┘

Note: requestId and tempId are used for optimistic update correlation.
The server echoes these back in responses so the client can match
responses to requests and replace temp IDs with real server IDs.
```

### Server → Client

```
┌─────────────────────────────────────────────────────────────┐
│ Terminal Messages                                            │
├─────────────────────────────────────────────────────────────┤
│ terminals:list     { terminals: [] }      ◄─── Initial sync │
│ terminal:created   { terminal, isNew,                       │
│                      requestId?, tempId? }                  │
│ terminal:destroyed { terminalId }                           │
│ terminal:output    { terminalId, data }                     │
│ terminal:exit      { terminalId, exitCode }                 │
│ terminal:attached  { terminalId, buffer }                   │
│ terminal:renamed   { terminalId, name }                     │
│ terminal:tabAssigned { terminalId, tabId, position }        │
│ terminal:bufferCleared { terminalId }                       │
│ terminal:error     { terminalId?, error,                    │
│                      requestId?, tempId? }                  │
├─────────────────────────────────────────────────────────────┤
│ Tab Messages                                                 │
├─────────────────────────────────────────────────────────────┤
│ tabs:list          { tabs: [] }           ◄─── Initial sync │
│ tab:created        { tab, requestId?, tempId? }             │
│ tab:updated        { tabId, name?, directory? }             │
│ tab:deleted        { tabId }                                │
│ tab:reordered      { tabId, position }                      │
├─────────────────────────────────────────────────────────────┤
│ Sync Messages                                                │
├─────────────────────────────────────────────────────────────┤
│ sync:stale         { entityType, entityId, error,           │
│                      requestId?, tempId? }                  │
│                    ◄─── Operation on deleted entity         │
└─────────────────────────────────────────────────────────────┘
```

## Protection Mechanisms

```
┌─────────────────────────────────────────────────────────────┐
│                Tab Terminal Protection                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client                           Server                     │
│    │                                │                        │
│    │  terminal:destroy              │                        │
│    │  { terminalId, force: false }  │                        │
│    │───────────────────────────────►│                        │
│    │                                │                        │
│    │                                │  Check: has tabId?     │
│    │                                │  Check: force flag?    │
│    │                                │                        │
│    │  terminal:error                │  ◄── BLOCKED          │
│    │  "Tab terminals require..."    │                        │
│    │◄───────────────────────────────│                        │
│    │                                │                        │
│                                                              │
│  User clicks X button:                                       │
│    │                                │                        │
│    │  terminal:destroy              │                        │
│    │  { terminalId,                 │                        │
│    │    force: true,                │                        │
│    │    reason: 'user_closed' }     │                        │
│    │───────────────────────────────►│                        │
│    │                                │                        │
│    │  terminal:destroyed            │  ◄── ALLOWED          │
│    │  { terminalId }                │                        │
│    │◄───────────────────────────────│                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Tab Deletion Cascade

```
┌─────────────────────────────────────────────────────────────┐
│                  Tab Deletion Flow                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client                           Server                     │
│    │                                │                        │
│    │  tab:delete { tabId }          │                        │
│    │───────────────────────────────►│                        │
│    │                                │                        │
│    │                                │  1. Find terminals     │
│    │                                │     in this tab        │
│    │                                │                        │
│    │  terminal:destroyed (T1)       │  2. Destroy each       │
│    │◄───────────────────────────────│     and broadcast      │
│    │                                │                        │
│    │  terminal:destroyed (T2)       │                        │
│    │◄───────────────────────────────│                        │
│    │                                │                        │
│    │  tab:deleted { tabId }         │  3. Delete tab         │
│    │◄───────────────────────────────│     and broadcast      │
│    │                                │                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
src/stores/
├── index.tsx              # StoreProvider, useStore hook
├── root-store.ts          # Root store composition
├── terminal-data-model.md # This file
│
├── models/
│   ├── index.ts           # Model exports
│   ├── terminal.ts        # Terminal model
│   ├── tab.ts             # Tab model
│   └── view-state.ts      # View state model
│
├── hooks/
│   ├── index.ts           # Hook exports
│   └── use-terminal-store.ts  # useTerminalStore hook
│
└── sync/
    └── index.ts           # Request ID generation, patch utilities
```

## Optimistic Update Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │  MST Store  │     │   Server    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  createTerminal() │                   │
       │──────────────────►│                   │
       │                   │                   │
       │                   │  1. Generate      │
       │                   │     requestId     │
       │                   │     tempId        │
       │                   │                   │
       │                   │  2. Create        │
       │                   │     optimistic    │
       │                   │     terminal      │
       │                   │     (isPending)   │
       │                   │                   │
       │  UI shows new     │  3. Record        │
       │  terminal         │     inverse       │
       │◄──────────────────│     patches       │
       │                   │                   │
       │                   │  4. Send with     │
       │                   │     requestId     │
       │                   │──────────────────►│
       │                   │                   │
       │                   │                   │  Persist
       │                   │                   │  Broadcast
       │                   │                   │
       │                   │  terminal:created │
       │                   │  { requestId,     │
       │                   │    tempId,        │
       │                   │    terminal }     │
       │                   │◄──────────────────│
       │                   │                   │
       │                   │  5. Match by      │
       │                   │     requestId     │
       │                   │                   │
       │                   │  6. Replace temp  │
       │                   │     with real ID  │
       │                   │                   │
       │  UI updates to    │                   │
       │  real terminal    │                   │
       │◄──────────────────│                   │
       │                   │                   │
       ▼                   ▼                   ▼
```

## Migration Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Bug fixes (protection, cascade) | ✅ Complete |
| 1 | MST infrastructure setup | ✅ Complete |
| 2 | Migrate WebSocket handler | ✅ Complete |
| 3 | Migrate Terminals view | ✅ Complete |
| 4 | Optimistic updates with rollback | ✅ Complete |
| 5 | Multi-client sync (stale detection) | ✅ Complete |
