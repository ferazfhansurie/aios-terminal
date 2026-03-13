import { createContext, useContext, ReactNode } from 'react'
import { useTaskManager } from '../components/TaskList'

const TaskContext = createContext<ReturnType<typeof useTaskManager> | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const taskManager = useTaskManager()
  return <TaskContext.Provider value={taskManager}>{children}</TaskContext.Provider>
}

export function useTaskContext() {
  const context = useContext(TaskContext)
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider')
  }
  return context
}