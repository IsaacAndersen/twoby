import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import { useMetaTags } from '@/hooks/useMetaTags'

type ChartMode = 'tier' | 'single_axis' | 'two_axis'

interface Item {
  id: string
  label: string
  image_url?: string
  r_x?: number
  r_y?: number
  x_mu?: number
  y_mu?: number
  tier_mu?: number
}

interface ChartData {
  title: string
  mode: ChartMode
  x_label?: string
  y_label?: string
  items: Item[]
  show_images?: boolean
  voting_active?: boolean
  ends_at?: string
}

export default function VoteChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const shareKey = searchParams.get('s')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [pairA, setPairA] = useState<Item | null>(null)
  const [pairB, setPairB] = useState<Item | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Removed voting mode selection - only pairwise voting now
  const [currentAxis, setCurrentAxis] = useState<'x' | 'y'>('x')
  const [voteCount, setVoteCount] = useState(0)
  const [voteLimit, setVoteLimit] = useState(10)
  const [axisVoteCounts, setAxisVoteCounts] = useState({ x: 0, y: 0 })
  const [currentPhase, setCurrentPhase] = useState<'x_phase' | 'y_phase' | 'mixed_phase'>('x_phase')
  const [showImages, setShowImages] = useState(true)

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twoby_api.ike.rs'

  function renderItem(item: Item, size: 'small' | 'large' = 'large') {
    const hasImages = chart?.items.some(i => i.image_url)
    const shouldShowImage = hasImages && showImages && item.image_url
    
    if (shouldShowImage) {
      return (
        <div className={`flex ${size === 'small' ? 'items-center gap-2' : 'flex-col items-center gap-2'} ${size === 'small' ? 'text-sm' : ''}`}>
          <img 
            src={item.image_url} 
            alt={item.label}
            className={`${size === 'small' ? 'w-6 h-6' : 'w-16 h-16'} object-cover rounded`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <span className="text-center">{item.label}</span>
        </div>
      )
    }
    
    return <span>{item.label}</span>
  }


  function formatTimeRemaining(endTime: string): string {
    try {
      const end = new Date(endTime.replace('Z', '+00:00'))
      const now = new Date()
      const diff = end.getTime() - now.getTime()
      
      if (diff <= 0) return 'Voting ended'
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      
      if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`
      if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`
      return `${minutes} minute${minutes === 1 ? '' : 's'} left`
    } catch {
      return 'Time remaining unknown'
    }
  }

  // Update meta tags for sharing
  useMetaTags({
    title: chart ? `Vote on "${chart.title}" - twoby` : 'twoby - Vote on Opinion Maps',
    description: chart ? `Cast your vote on "${chart.title}" - help create a collaborative ${chart.mode === 'tier' ? 'tier list' : chart.mode === 'single_axis' ? 'ranking' : '2×2 comparison'} on twoby` : 'Vote on collaborative opinion maps and see real-time results.',
    url: window.location.href,
    image: id && shareKey ? `https://twobyapi.ike.rs/api/og/chart/${id}?s=${shareKey}&type=vote` : 'https://twoby.ike.rs/og-default.png'
  })

  useEffect(() => {
    loadChart()
    // Load vote count from sessionStorage
    const saved = sessionStorage.getItem(`votes_${id}`)
    if (saved) {
      const count = parseInt(saved)
      setVoteCount(count)
      // Check against dynamic limit once chart is loaded
    }
  }, [id, shareKey])

  // Add keyboard event listener for arrow keys
  useEffect(() => {
    function handleKeyPress(event: KeyboardEvent) {
      if (!pairA || !pairB || chart?.voting_active === false) return
      
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePairVote(pairA)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        handlePairVote(pairB)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [pairA, pairB, chart?.voting_active])

  async function loadChart() {
    if (!id || !shareKey) return

    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/public?s=${shareKey}`)
      if (!response.ok) throw new Error('Chart not found')
      
      const data = await response.json()
      setChart(data)
      
      // Calculate dynamic vote limit based on item count
      const itemCount = data.items.length
      const dynamicLimit = Math.min(10, Math.max(2, Math.ceil(itemCount * 0.7)))
      setVoteLimit(dynamicLimit)
      
      // Load existing vote count from sessionStorage (but don't redirect)
      
      generatePair(data.items)
    } catch (error) {
      console.error('Error loading chart:', error)
      alert('Failed to load chart')
    } finally {
      setIsLoading(false)
    }
  }

  function generatePair(items: Item[]) {
    if (items.length < 2) return
    
    const shuffled = [...items].sort(() => Math.random() - 0.5)
    setPairA(shuffled[0])
    setPairB(shuffled[1])
  }

  async function handlePairVote(winner: Item, axis?: 'x' | 'y') {
    if (!pairA || !pairB || !shareKey || !chart) return
    
    // Check if voting is still active
    if (chart.voting_active === false) {
      alert('Voting period has ended for this chart.')
      return
    }

    try {
      await fetch(`${API_BASE}/api/vote/pair?s=${shareKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          axis: axis || currentAxis,
          item_a: pairA.id,
          item_b: pairB.id,
          winner: winner.id
        })
      })

      const newCount = voteCount + 1
      setVoteCount(newCount)
      sessionStorage.setItem(`votes_${id}`, newCount.toString())

      if (newCount >= voteLimit) {
        // Navigate directly to results page instead of showing local results
        navigate(`/c/${id}?s=${shareKey}`)
        return
      }

      // For 2D charts, handle sequential voting by phase
      if (chart.mode === 'two_axis') {
        const newAxisCounts = {
          ...axisVoteCounts,
          [axis || currentAxis]: axisVoteCounts[axis || currentAxis] + 1
        }
        setAxisVoteCounts(newAxisCounts)
        
        // Determine phase transitions
        const halfLimit = Math.ceil(voteLimit / 2)
        if (currentPhase === 'x_phase' && newAxisCounts.x >= halfLimit) {
          setCurrentPhase('y_phase')
          setCurrentAxis('y')
        } else if (currentPhase === 'y_phase' && newAxisCounts.y >= halfLimit) {
          setCurrentPhase('mixed_phase')
          // In mixed phase, alternate axes
          setCurrentAxis(currentAxis === 'x' ? 'y' : 'x')
        }
      }

      generatePair(chart.items)
    } catch (error) {
      console.error('Error voting:', error)
      alert('Failed to submit vote')
    }
  }


  if (isLoading) return <div className="container mx-auto py-8 text-center">Loading...</div>
  if (!chart) return <div className="container mx-auto py-8 text-center">Chart not found</div>

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal header */}
      <div className="flex justify-between items-center p-4 border-b">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </Link>
        <div className="flex flex-col items-center">
          <h1 className="text-lg font-semibold">{chart.title}</h1>
          {chart.ends_at && (
            <span className={`text-xs ${chart.voting_active ? 'text-orange-600' : 'text-red-600'}`}>
              {formatTimeRemaining(chart.ends_at)}
            </span>
          )}
        </div>
        <Link to="/create">
          <Button variant="ghost" size="sm">
            Create New
          </Button>
        </Link>
      </div>
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto p-4">
        {/* Single progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">
              {voteCount} votes cast
            </span>
            {voteCount < voteLimit ? (
              <span className="text-xs text-muted-foreground">
                {voteLimit - voteCount} to see results
              </span>
            ) : (
              <span className="text-xs text-green-600">
                Results unlocked
              </span>
            )}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                voteCount >= voteLimit ? 'bg-green-600' : 'bg-gray-900'
              }`}
              style={{ width: `${Math.min(100, (voteCount / voteLimit) * 100)}%` }}
            />
          </div>
        </div>
        

        {/* Voting ended message */}
        {chart.voting_active === false && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">
              Voting period ended. View final results below.
            </p>
            <Button 
              onClick={() => navigate(`/c/${id}?s=${shareKey}`)}
              size="sm"
              className="mt-2"
            >
              View Results
            </Button>
          </div>
        )}

        {chart.voting_active !== false && chart?.items.some(i => i.image_url) && (
          <div className="mb-4 flex justify-center">
            <Button 
              variant={showImages ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? '🖼️ Images' : '📝 Text'}
            </Button>
          </div>
        )}

            {/* Auto-transition to results when vote limit reached */}

        {pairA && pairB && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <h2 className="text-2xl font-medium text-center">
                {chart.mode === 'tier' 
                  ? 'Which ranks higher?' 
                  : chart.mode === 'single_axis'
                    ? `Which is more "${chart.x_label?.split(' → ')[1] || chart.x_label}"?`
                    : `Which is more "${(currentAxis === 'x' ? chart.x_label : chart.y_label)?.split(' → ')[1] || (currentAxis === 'x' ? chart.x_label : chart.y_label)}"?`
                }
              </h2>
            </div>
            
            <div className="flex-1 flex flex-col justify-center space-y-8">
              <div className="grid grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
                <Button 
                  variant="outline" 
                  className="h-40 text-xl font-medium hover:bg-gray-50 border-2 transition-all hover:scale-105"
                  onClick={() => handlePairVote(pairA)}
                >
                  {renderItem(pairA)}
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-40 text-xl font-medium hover:bg-gray-50 border-2 transition-all hover:scale-105"
                  onClick={() => handlePairVote(pairB)}
                >
                  {renderItem(pairB)}
                </Button>
              </div>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Click a button or use ← / → arrow keys
                </p>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-muted-foreground/80"
                  onClick={() => {
                    // Skip this pair without recording a preference
                    generatePair(chart.items)
                  }}
                >
                  No preference / Skip
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}