import { useState } from 'react'

interface Task {
  id: string
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
  timestamp: number
}

interface TaskListProps {
  tasks: Task[]
  className?: string
  isFloating?: boolean
  onToggle?: () => void
}

export default function TaskList({ tasks, className = '', isFloating = false, onToggle }: TaskListProps) {
  const [collapsed, setCollapsed] = useState(false)

  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'in_progress': return '🔄'
      case 'completed': return '✅'
    }
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending': return 'text-neutral-500'
      case 'in_progress': return 'text-blue-400'
      case 'completed': return 'text-green-400'
    }
  }

  if (tasks.length === 0) return null

  const TaskSection = ({ title, tasks, defaultOpen = true }: {
    title: string;
    tasks: Task[];
    defaultOpen?: boolean
  }) => {
    const [open, setOpen] = useState(defaultOpen)
    if (tasks.length === 0) return null

    return (
      <div className="mb-3">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-xs font-medium text-neutral-400 mb-2 hover:text-neutral-300 transition-colors"
        >
          <span className="uppercase tracking-wider">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-600">{tasks.length}</span>
            <span className={`text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          </div>
        </button>
        {open && (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.04] text-xs"
              >
                <span className="text-[10px] mt-0.5">{getStatusIcon(task.status)}</span>
                <span className={`flex-1 ${getStatusColor(task.status)}`}>
                  {task.status === 'in_progress' ? task.activeForm : task.content}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isFloating) {
    return (
      <div className={`fixed bottom-4 right-4 w-80 bg-[#1a1a1e] border border-white/[0.08] rounded-xl shadow-2xl z-50 ${className}`}>
        <div className="flex items-center justify-between p-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-100">Tasks</span>
            <span className="text-[10px] text-neutral-500 bg-white/[0.05] px-1.5 py-0.5 rounded">
              {tasks.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? '▲' : '▼'}
            </button>
            <button
              onClick={onToggle}
              className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors ml-1"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="p-3 max-h-96 overflow-y-auto">
            <TaskSection title="In Progress" tasks={inProgressTasks} />
            <TaskSection title="Pending" tasks={pendingTasks} />
            <TaskSection title="Completed" tasks={completedTasks} defaultOpen={false} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Tasks</span>
          <span className="text-[10px] text-neutral-600">{tasks.length}</span>
        </div>

        <div className="max-h-64 overflow-y-auto">
          <TaskSection title="In Progress" tasks={inProgressTasks} />
          <TaskSection title="Pending" tasks={pendingTasks} />
          <TaskSection title="Completed" tasks={completedTasks} defaultOpen={false} />
        </div>
      </div>
    </div>
  )
}

// Hook to manage tasks globally
export function useTaskManager() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showFloating, setShowFloating] = useState(false)

  const addTask = (content: string, activeForm: string) => {
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content,
      activeForm,
      status: 'pending',
      timestamp: Date.now(),
    }
    setTasks(prev => [...prev, task])
    return task.id
  }

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const clearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status !== 'completed'))
  }

  const toggleFloating = () => {
    setShowFloating(!showFloating)
  }

  return {
    tasks,
    showFloating,
    addTask,
    updateTask,
    removeTask,
    clearCompleted,
    toggleFloating,
    setShowFloating,
  }
}