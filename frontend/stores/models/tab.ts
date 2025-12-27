import { types, getRoot } from 'mobx-state-tree'
import type { Instance, SnapshotIn, IAnyStateTreeNode } from 'mobx-state-tree'
import type { ITerminal } from './terminal'

/**
 * Tab model representing a terminal tab container.
 *
 * Tabs are first-class entities that can exist independently of terminals.
 * Terminals can optionally belong to a tab via their `tabId` property.
 */
export const TabModel = types
  .model('Tab', {
    id: types.identifier,
    name: types.string,
    position: types.number,
    directory: types.maybeNull(types.string),
    createdAt: types.number,
  })
  .volatile(() => ({
    /** Whether this tab is pending creation confirmation from server */
    isPending: false,
  }))
  .views((self) => ({
    /**
     * Get all terminals that belong to this tab.
     * Computed view that automatically updates when terminals change.
     */
    get terminals(): ITerminal[] {
      // Use any to avoid circular dependency with root-store
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const root = getRoot<IAnyStateTreeNode>(self) as any
      if (!root.terminals?.items) return []
      return root.terminals.items
        .filter((t: ITerminal) => t.tabId === self.id)
        .sort((a: ITerminal, b: ITerminal) => a.positionInTab - b.positionInTab)
    },

    /** Number of terminals in this tab */
    get terminalCount(): number {
      return this.terminals.length
    },
  }))
  .actions((self) => ({
    /** Update tab properties from server message */
    updateFromServer(data: Partial<{ name: string; directory: string | null; position: number }>) {
      if (data.name !== undefined) self.name = data.name
      if (data.directory !== undefined) self.directory = data.directory
      if (data.position !== undefined) self.position = data.position
    },

    /** Rename the tab */
    rename(name: string) {
      self.name = name
    },

    /** Update the tab's directory */
    setDirectory(directory: string | null) {
      self.directory = directory
    },

    /** Update the tab's position */
    setPosition(position: number) {
      self.position = position
    },

    /** Set pending state for optimistic updates */
    setPending(isPending: boolean) {
      self.isPending = isPending
    },
  }))

export type ITab = Instance<typeof TabModel>
export type ITabSnapshot = SnapshotIn<typeof TabModel>
