import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface SelectionContextValue {
  selectedIds: Set<string>
  lastSelectedId: string | null
  toggleSelection: (taskId: string) => void
  selectRange: (taskId: string, allTaskIds: string[]) => void
  clearSelection: () => void
  isSelected: (taskId: string) => boolean
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)

  const toggleSelection = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
    setLastSelectedId(taskId)
  }, [])

  const selectRange = useCallback((taskId: string, allTaskIds: string[]) => {
    if (!lastSelectedId) {
      // No previous selection, just select this one
      setSelectedIds(new Set([taskId]))
      setLastSelectedId(taskId)
      return
    }

    const startIndex = allTaskIds.indexOf(lastSelectedId)
    const endIndex = allTaskIds.indexOf(taskId)

    if (startIndex === -1 || endIndex === -1) {
      // One of the tasks isn't in the list, just select the clicked one
      setSelectedIds(new Set([taskId]))
      setLastSelectedId(taskId)
      return
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    const rangeIds = allTaskIds.slice(from, to + 1)

    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of rangeIds) {
        next.add(id)
      }
      return next
    })
    // Keep lastSelectedId unchanged for range selection
  }, [lastSelectedId])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastSelectedId(null)
  }, [])

  const isSelected = useCallback((taskId: string) => {
    return selectedIds.has(taskId)
  }, [selectedIds])

  return (
    <SelectionContext.Provider
      value={{
        selectedIds,
        lastSelectedId,
        toggleSelection,
        selectRange,
        clearSelection,
        isSelected,
      }}
    >
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelection() {
  const context = useContext(SelectionContext)
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return context
}
