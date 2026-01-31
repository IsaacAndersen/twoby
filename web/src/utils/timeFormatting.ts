export function formatRelativeTime(dateString: string): { 
  relative: string; 
  absolute: string; 
  className?: string;
} {
  // Handle both old format (with +00:00Z) and new format (with just Z)
  const cleanDate = dateString.replace('+00:00Z', 'Z')
  const date = new Date(cleanDate)
  
  // If date is invalid, return fallback
  if (isNaN(date.getTime())) {
    return {
      relative: 'Recently',
      absolute: 'Unknown date'
    }
  }
  
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  
  let relative: string
  let className: string = ''
  
  if (diffMins < 1) {
    relative = 'Just now'
    className = 'text-green-600'
  } else if (diffMins < 60) {
    relative = `${diffMins}m ago`
    className = 'text-green-600'
  } else if (diffHours < 24) {
    relative = `${diffHours}h ago`
    className = diffHours < 3 ? 'text-green-600' : 'text-blue-600'
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`
    className = 'text-blue-600'
  } else if (diffWeeks < 4) {
    relative = `${diffWeeks}w ago`
    className = 'text-gray-600'
  } else if (diffMonths < 12) {
    relative = `${diffMonths}mo ago`
    className = 'text-gray-500'
  } else {
    const years = Math.floor(diffMonths / 12)
    relative = `${years}y ago`
    className = 'text-gray-400'
  }
  
  const absolute = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
  
  return {
    relative,
    absolute,
    className
  }
}