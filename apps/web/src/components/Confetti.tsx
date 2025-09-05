import { useEffect, useState } from 'react'

interface ConfettiProps {
  show: boolean
  onComplete?: () => void
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  color: string
  size: number
  opacity: number
}

const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4']

export default function Confetti({ show, onComplete }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!show) {
      setParticles([])
      return
    }

    // Create particles
    const newParticles: Particle[] = []
    for (let i = 0; i < 30; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -10,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 4,
        opacity: 1
      })
    }
    setParticles(newParticles)

    // Animation loop
    let animationId: number
    let startTime = Date.now()
    const duration = 2000 // 2 seconds

    function animate() {
      const elapsed = Date.now() - startTime
      const progress = elapsed / duration

      if (progress >= 1) {
        setParticles([])
        onComplete?.()
        return
      }

      setParticles(prevParticles => 
        prevParticles.map(particle => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vy: particle.vy + 0.3, // gravity
          rotation: particle.rotation + particle.rotationSpeed,
          opacity: 1 - (progress * 0.5) // fade out slowly
        })).filter(p => p.y < window.innerHeight + 50)
      )

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [show, onComplete])

  if (!show || particles.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            transform: `rotate(${particle.rotation}deg)`,
            opacity: particle.opacity,
            borderRadius: '2px',
            transition: 'opacity 0.1s ease-out'
          }}
        />
      ))}
    </div>
  )
}