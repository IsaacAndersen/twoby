
interface AvatarProps {
  src?: string
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Generate a deterministic color from string
function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Generate a pleasant color palette
  const colors = [
    '#3B82F6', // blue
    '#8B5CF6', // purple  
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#6B7280', // gray
    '#EC4899', // pink
    '#14B8A6', // teal
  ]
  
  return colors[Math.abs(hash) % colors.length]
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base'
  }
  
  const baseClasses = `${sizeClasses[size]} rounded-full border flex items-center justify-center font-medium ${className}`
  
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${baseClasses} object-cover`}
        onError={(e) => {
          // Fallback to monogram on image error
          const target = e.target as HTMLImageElement
          const parent = target.parentElement
          if (parent) {
            const initials = getInitials(name)
            const bgColor = stringToColor(name)
            parent.innerHTML = `<div class="${baseClasses}" style="background-color: ${bgColor}; color: white;">${initials}</div>`
          }
        }}
      />
    )
  }
  
  // Monogram fallback
  const initials = getInitials(name)
  const bgColor = stringToColor(name)
  
  return (
    <div 
      className={`${baseClasses} text-white`}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </div>
  )
}