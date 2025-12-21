import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Task } from '@/types'

interface DragContextValue {
  activeTask: Task | null
  setActiveTask: (task: Task | null) => void
}

const DragContext = createContext<DragContextValue | null>(null)

export function DragProvider({ children }: { children: ReactNode }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  return (
    <DragContext.Provider value={{ activeTask, setActiveTask }}>
      {children}
    </DragContext.Provider>
  )
}

export function useDrag() {
  const ctx = useContext(DragContext)
  if (!ctx) {
    throw new Error('useDrag must be used within DragProvider')
  }
  return ctx
}
