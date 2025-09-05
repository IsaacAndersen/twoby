import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface SnackbarProps {
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  onDismiss: () => void
  duration?: number
}

export default function Snackbar({ message, action, onDismiss, duration = 6000 }: SnackbarProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Slide in
    const timer = setTimeout(() => setIsVisible(true), 100)
    
    // Auto-dismiss
    const dismissTimer = setTimeout(() => {
      handleDismiss()
    }, duration)

    return () => {
      clearTimeout(timer)
      clearTimeout(dismissTimer)
    }
  }, [duration])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(onDismiss, 300) // Wait for animation
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <div 
        className={`
          bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg max-w-md w-full
          flex items-center justify-between gap-3
          transform transition-all duration-300 ease-out
          ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
        `}
      >
        <span className="text-sm flex-1">{message}</span>
        
        <div className="flex items-center gap-2">
          {action && (
            <button
              onClick={() => {
                action.onClick()
                handleDismiss()
              }}
              className="text-blue-300 hover:text-blue-200 text-sm font-medium px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            >
              {action.label}
            </button>
          )}
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}