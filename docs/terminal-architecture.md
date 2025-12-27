# Terminal Architecture

This document describes the terminal implementation in Vibora, including the MobX State Tree (MST) data model, important implementation details, and gotchas learned from debugging.

## Table of Contents

- [Store Architecture](#store-architecture)
- [Entity Relationships](#entity-relationships)
- [Terminal Types](#terminal-types)
- [Data Flow](#data-flow)
- [WebSocket Message Types](#websocket-message-types)
- [Optimistic Update Flow](#optimistic-update-flow)
- [Task Terminal Startup Flow](#task-terminal-startup-flow)
- [Gotchas & Critical Implementation Details](#gotchas--critical-implementation-details)
- [Protection Mechanisms](#protection-mechanisms)
- [File Structure](#file-structure)

---

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
│  │    pendingUpdates: Map<string, PendingUpdate>                  │  │
│  │    terminalsPendingStartup: Map<string, StartupInfo>           │  │
│  │    onAttachedCallbacks: Map<string, callback>                  │  │
│  │    terminalsReadyForCallback: Set<string>                      │  │
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
   │              │           │ cwd: in      │
   │ Belongs to a │           │ worktrees/   │
   │ regular tab  │           │              │
   │              │           │ Associated   │
   │ Protected by │           │ with a task  │
   │ force flag   │           │ worktree     │
   │ (server-side)│           │              │
   │              │           │ Protected by │
   │              │           │ force flag   │
   │              │           │ (server-side)│
   └──────────────┘           └──────────────┘
```

**Key distinction**: Both terminal types are protected by a server-side `force` flag requirement.
Task terminals are identified by having no `tabId` AND a `cwd` inside the worktrees directory.

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

## Task Terminal Startup Flow

Task terminals automatically launch Claude Code with the task prompt. The startup
info is stored in the MST store (not component refs) to survive React component
unmount/remount cycles (e.g., React strict mode, navigation).

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Task Terminal Startup Flow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TaskTerminal              MST Store                   Server        │
│       │                        │                          │         │
│       │  createTerminal({      │                          │         │
│       │    name, cwd,          │                          │         │
│       │    startup: {          │                          │         │
│       │      startupScript,    │                          │         │
│       │      aiMode,           │                          │         │
│       │      description,      │                          │         │
│       │      taskName          │                          │         │
│       │    }                   │                          │         │
│       │  })                    │                          │         │
│       │───────────────────────►│                          │         │
│       │                        │                          │         │
│       │                        │  1. Create optimistic    │         │
│       │                        │     terminal (tempId)    │         │
│       │                        │                          │         │
│       │                        │  2. Store startup in     │         │
│       │                        │     terminalsPending-    │         │
│       │                        │     Startup[tempId]      │         │
│       │                        │                          │         │
│       │                        │  3. Send terminal:create │         │
│       │                        │─────────────────────────►│         │
│       │                        │                          │         │
│       │                        │     terminal:created     │         │
│       │                        │     { realId, tempId }   │         │
│       │                        │◄─────────────────────────│         │
│       │                        │                          │         │
│       │                        │  4. Transfer startup     │         │
│       │                        │     from tempId → realId │         │
│       │                        │                          │         │
│       │                        │  5. Re-attach xterm      │         │
│       │                        │     with onAttached cb   │         │
│       │                        │                          │         │
│       │                        │     terminal:attached    │         │
│       │                        │◄─────────────────────────│         │
│       │                        │                          │         │
│       │   onAttached(realId)   │  6. Call onAttached      │         │
│       │◄───────────────────────│     with terminalId arg  │         │
│       │                        │                          │         │
│       │  consumePending-       │                          │         │
│       │  Startup(realId)       │                          │         │
│       │───────────────────────►│                          │         │
│       │                        │                          │         │
│       │  ◄── Returns startup   │  7. Delete from map      │         │
│       │      info & deletes    │     (prevents re-run)    │         │
│       │                        │                          │         │
│       │  8. Run startupScript  │                          │         │
│       │     + Claude command   │                          │         │
│       │                        │                          │         │
│       ▼                        ▼                          ▼         │
└─────────────────────────────────────────────────────────────────────┘
```

### StartupInfo Structure

```typescript
interface StartupInfo {
  startupScript?: string | null  // e.g., "mise trust && npm install"
  aiMode?: 'default' | 'plan'    // Claude permission mode
  description?: string           // Task description for prompt
  taskName: string               // Task name for prompt
  serverPort?: number            // Vibora server port for CLI commands
}
```

---

## Gotchas & Critical Implementation Details

### 1. dtach Session Lifecycle

Vibora uses `dtach` for persistent terminal sessions. Understanding the lifecycle is critical:

1. **Creation** (`dtach -n`): Creates socket and spawns shell, then **exits immediately**
2. **Attachment** (`dtach -a`): Connects to existing socket, this is the long-lived process

**Critical**: These are two separate processes. The creation process exits right away—don't hold references to it.

**Past Bug (Dec 2024)**: Task terminals showed blank screens because `start()` stored the short-lived `dtach -n` PTY in `this.pty`. When `attach()` checked `if (this.pty) return`, it bailed out thinking attachment already happened. Fix: Use a local variable for the creation PTY.

### 2. TempId → RealId Transition

When a terminal is created optimistically:
1. Client generates `tempId` (e.g., `temp-abc123`)
2. Server confirms with `realId` (e.g., `uuid-xyz789`)
3. Client must transition ALL state from tempId to realId

**Things that must be transferred:**
- Pending startup info (`terminalsPendingStartup`)
- xterm instance reference
- onAttached callbacks
- newTerminalIds tracking

**Common pitfall**: Forgetting to transfer something causes silent failures later.

### 3. Callback Closure Problem (Critical!)

When React effects create callbacks, they close over state at creation time:

```typescript
// In React effect when terminalId = tempId
const onAttached = () => {
  // BAD: closes over currentTerminalId which is tempId
  writeToTerminal(currentTerminalId, data)  // writes to wrong terminal!
}
```

**The problem**: The callback is created when `terminalId` is `tempId`. After server confirms with `realId`, the callback still has `tempId` baked in.

**Solution**: Pass the actual terminalId as a parameter to the callback:

```typescript
// MST store calls: callback(terminalId)
const onAttached = (actualTerminalId: string) => {
  writeToTerminal(actualTerminalId, data)  // uses correct ID
}
```

### 4. Double Handler Registration

When transitioning tempId → realId, both MST and React can try to attach handlers:

```
Timeline:
  1. React effect runs for tempId → registers onData handler
  2. Server confirms with realId
  3. MST handler calls attachXterm(realId) → registers onData handler
  4. React effect cleanup runs (terminalId changed)
  5. React effect runs for realId → registers ANOTHER onData handler!
```

**Result**: Every keystroke is sent twice (double input).

**Solution**: Make `attachXterm` idempotent:

```typescript
attachXterm(terminalId, xterm, options) {
  // If same xterm already attached, skip re-attachment
  if (terminal.xterm === xterm) {
    // Just register callback if needed
    return existingCleanup
  }
  // ... proceed with attachment
}
```

### 5. Cleanup Before Re-attachment

When transitioning from tempId to realId, you MUST cleanup old handlers before attaching new ones:

```typescript
// In terminal:created handler
if (oldCleanup) {
  oldCleanup()  // Dispose old onData handlers
}
// Now safe to re-attach
attachXterm(realId, xterm, { onAttached })
```

Without this, the old tempId handlers remain active on the xterm, causing double input.

### 6. Race: terminal:attached Before Callback Registration

Sometimes the server responds with `terminal:attached` before the React effect has registered its callback:

```
Timeline:
  1. MST sends terminal:attach
  2. Server immediately responds with terminal:attached
  3. MST handler checks for callback → none registered yet!
  4. React effect runs, registers callback
  5. Callback never fires (terminal:attached already processed)
```

**Solution**: Track terminals that are "ready" for callback:

```typescript
// In terminal:attached handler
if (!callback) {
  terminalsReadyForCallback.add(terminalId)
}

// In attachXterm when registering callback
if (terminalsReadyForCallback.has(terminalId)) {
  terminalsReadyForCallback.delete(terminalId)
  callback(terminalId)  // Call immediately
}
```

### 7. Store-Based vs React Ref State

**Don't use React refs for state that must survive component lifecycle:**

- Component unmount/remount loses ref values
- React strict mode double-renders cause issues
- Navigation between views remounts components

**Use MST volatile state instead:**
- `terminalsPendingStartup` - survives component unmount
- `onAttachedCallbacks` - survives component unmount
- `terminalsReadyForCallback` - race condition tracking

### 8. Why consumePendingStartup Must Be Atomic

```typescript
consumePendingStartup(terminalId) {
  const startup = map.get(terminalId)
  if (startup) {
    map.delete(terminalId)  // Delete BEFORE returning
  }
  return startup
}
```

If you return first then delete later, a race condition can cause double execution:
1. Component A calls consume, gets startup
2. Component B calls consume before A deletes, also gets startup
3. Both run startup commands

---

## Protection Mechanisms

### Tab Terminal Protection

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

### Task Terminal Protection

Task terminals (terminals in the worktrees directory without a tabId) are protected
by the same force flag mechanism. This prevents accidental deletion from frontend bugs
or stale state.

```
┌─────────────────────────────────────────────────────────────┐
│               Task Terminal Protection                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Detection:                                                  │
│    isTaskTerminal = !tabId && cwd.startsWith(worktreesDir)  │
│                                                              │
│  Legitimate deletion paths (bypass WebSocket):              │
│    - Task deletion (destroyTerminalsForWorktree)            │
│    - Worktree deletion (destroyTerminalsForWorktree)        │
│                                                              │
│  WebSocket protection (requires force: true):               │
│    - User-initiated close from UI                           │
│                                                              │
│  Blocked (no force flag):                                   │
│    - Accidental cleanup from frontend bugs                  │
│    - Stale state race conditions                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters**: Previously, a frontend "orphan cleanup" effect could incorrectly
identify valid task terminals as orphaned due to React Query timing issues. The server-side
protection ensures task terminals can only be deleted through explicit user actions.

### Tab Deletion Cascade

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

---

## File Structure

```
docs/
└── terminal-architecture.md   # This file

frontend/stores/
├── index.tsx                  # StoreProvider, useStore hook
├── root-store.ts              # Root store composition + actions
│
├── models/
│   ├── index.ts               # Model exports
│   ├── terminal.ts            # Terminal model
│   ├── tab.ts                 # Tab model
│   └── view-state.ts          # View state model
│
├── hooks/
│   ├── index.ts               # Hook exports
│   └── use-terminal-store.ts  # useTerminalStore hook
│
└── sync/
    └── index.ts               # Request ID generation, patch utilities

frontend/hooks/
└── use-terminal-ws.ts         # Legacy compatibility wrapper

frontend/components/terminal/
├── task-terminal.tsx          # Task terminal with auto-Claude startup
├── terminal-panel.tsx         # Tab terminal panel
└── ...

server/websocket/
└── terminal-ws.ts             # WebSocket handlers with protection logic
```

---

## Migration Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Bug fixes (protection, cascade) | ✅ Complete |
| 1 | MST infrastructure setup | ✅ Complete |
| 2 | Migrate WebSocket handler | ✅ Complete |
| 3 | Migrate Terminals view | ✅ Complete |
| 4 | Optimistic updates with rollback | ✅ Complete |
| 5 | Multi-client sync (stale detection) | ✅ Complete |
| 6 | Task terminal startup fix | ✅ Complete |
| 7 | TempId→RealId race conditions | ✅ Complete |
| 8 | Task terminal protection (force flag) | ✅ Complete |
