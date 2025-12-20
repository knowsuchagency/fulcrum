import type { Task, TerminalTab, Terminal } from '@/types'

export const mockTasks: Task[] = [
  // IN_PROGRESS
  {
    id: 'task-4',
    title: 'Fix memory leak in terminal',
    description: 'Terminal instances not being properly disposed on unmount',
    status: 'IN_PROGRESS',
    position: 0,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'fix/terminal-memory-leak',
    worktreePath: '/home/dev/worktrees/terminal-memory-leak',
    createdAt: '2024-01-17T11:00:00Z',
    updatedAt: '2024-01-21T08:00:00Z',
  },
  {
    id: 'task-5',
    title: 'Implement xterm.js integration',
    description: 'Set up xterm.js with fit addon and proper theming',
    status: 'IN_PROGRESS',
    position: 1,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'feature/xterm-integration',
    worktreePath: '/home/dev/worktrees/xterm-integration',
    createdAt: '2024-01-16T15:00:00Z',
    updatedAt: '2024-01-21T10:00:00Z',
  },

  // IN_REVIEW
  {
    id: 'task-6',
    title: 'Refactor drag-and-drop logic',
    description: 'Migrate from react-beautiful-dnd to @dnd-kit for better React 18 support',
    status: 'IN_REVIEW',
    position: 0,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'refactor/dnd-kit-migration',
    worktreePath: '/home/dev/worktrees/dnd-kit-migration',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T16:00:00Z',
  },

  // DONE
  {
    id: 'task-7',
    title: 'Set up CI/CD pipeline',
    description: 'Configure GitHub Actions for testing and deployment',
    status: 'DONE',
    position: 0,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'chore/setup-ci',
    worktreePath: '/home/dev/worktrees/setup-ci',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
  },
  {
    id: 'task-8',
    title: 'Initial project scaffold',
    description: 'Set up React, Vite, Tailwind, and component library',
    status: 'DONE',
    position: 1,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'chore/initial-scaffold',
    worktreePath: '/home/dev/worktrees/initial-scaffold',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-09T18:00:00Z',
  },

  // CANCELLED
  {
    id: 'task-9',
    title: 'Electron desktop app',
    description: 'Package as desktop app - decided to stay web-only for now',
    status: 'CANCELLED',
    position: 0,
    repoPath: '/home/dev/projects/vibora',
    repoName: 'vibora',
    baseBranch: 'main',
    branch: 'feature/electron-app',
    worktreePath: '/home/dev/worktrees/electron-app',
    createdAt: '2024-01-11T10:00:00Z',
    updatedAt: '2024-01-14T11:00:00Z',
  },
]

export const mockTerminalTabs: TerminalTab[] = [
  {
    id: 'tab-1',
    name: 'Dev Servers',
    layout: 'split-h',
    position: 0,
  },
  {
    id: 'tab-2',
    name: 'Monitoring',
    layout: 'triple',
    position: 1,
  },
  {
    id: 'tab-3',
    name: 'SSH Sessions',
    layout: 'single',
    position: 2,
  },
]

export const mockTerminals: Terminal[] = [
  // Tab 1: Dev Servers (split-h layout)
  {
    id: 'term-1',
    tabId: 'tab-1',
    taskId: null,
    name: 'Frontend',
    position: 0,
    cwd: '/home/dev/projects/vibora',
  },
  {
    id: 'term-2',
    tabId: 'tab-1',
    taskId: null,
    name: 'Backend',
    position: 1,
    cwd: '/home/dev/projects/vibora-api',
  },

  // Tab 2: Monitoring (triple layout)
  {
    id: 'term-3',
    tabId: 'tab-2',
    taskId: null,
    name: 'Logs',
    position: 0,
    cwd: '/var/log',
  },
  {
    id: 'term-4',
    tabId: 'tab-2',
    taskId: null,
    name: 'htop',
    position: 1,
  },
  {
    id: 'term-5',
    tabId: 'tab-2',
    taskId: null,
    name: 'docker stats',
    position: 2,
  },

  // Tab 3: SSH (single layout)
  {
    id: 'term-6',
    tabId: 'tab-3',
    taskId: null,
    name: 'prod-server',
    position: 0,
  },
]

// Mock diff data for the diff viewer
export const mockDiff = `diff --git a/src/components/terminal/terminal.tsx b/src/components/terminal/terminal.tsx
index 1a2b3c4..5d6e7f8 100644
--- a/src/components/terminal/terminal.tsx
+++ b/src/components/terminal/terminal.tsx
@@ -1,5 +1,7 @@
 import { useEffect, useRef } from 'react'
 import { Terminal as XTerm } from 'xterm'
+import { FitAddon } from 'xterm-addon-fit'
+import { WebLinksAddon } from 'xterm-addon-web-links'
 import 'xterm/css/xterm.css'

 export function Terminal() {
@@ -12,6 +14,12 @@ export function Terminal() {
       fontFamily: 'JetBrains Mono Variable, monospace',
     })

+    const fitAddon = new FitAddon()
+    const webLinksAddon = new WebLinksAddon()
+
+    term.loadAddon(fitAddon)
+    term.loadAddon(webLinksAddon)
+
     term.open(containerRef.current)
-    term.write('Hello from xterm.js')
+    fitAddon.fit()
+    term.writeln('Welcome to Vibora Terminal')

     return () => term.dispose()
   }, [])
`
