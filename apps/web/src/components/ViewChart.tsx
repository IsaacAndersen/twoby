import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home, Share2, Flag } from 'lucide-react'
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
}

export default function ViewChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const shareKey = searchParams.get('s')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showImages, setShowImages] = useState(true)

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  function renderItem(item: Item, size: 'small' | 'medium' = 'medium') {
    const hasImages = chart?.items.some(i => i.image_url)
    const shouldShowImage = hasImages && showImages && item.image_url
    
    if (shouldShowImage) {
      return (
        <div className="flex items-center gap-2">
          <img 
            src={item.image_url} 
            alt={item.label}
            className={`${size === 'small' ? 'w-6 h-6' : 'w-8 h-8'} object-cover rounded`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <span>{item.label}</span>
        </div>
      )
    }
    
    return <span>{item.label}</span>
  }

  // Update meta tags for sharing
  useMetaTags({
    title: chart ? `${chart.title} - Results on twoby` : 'twoby - Collaborative Opinion Maps',
    description: chart ? `View the results of "${chart.title}" - a collaborative ${chart.mode === 'tier' ? 'tier list' : chart.mode === 'single_axis' ? 'ranking' : '2×2 comparison'} on twoby` : 'Create collaborative opinion maps and see what your friends really think.',
    url: window.location.href,
    image: id && shareKey ? `https://twobyapi.ike.rs/api/og/chart/${id}?s=${shareKey}&type=results` : 'https://twoby.ike.rs/og-default.png'
  })

  useEffect(() => {
    loadChart()
  }, [id, shareKey])

  async function loadChart() {
    if (!id || !shareKey) return

    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/public?s=${shareKey}`)
      if (!response.ok) throw new Error('Chart not found')
      
      const data = await response.json()
      setChart(data)
    } catch (error) {
      console.error('Error loading chart:', error)
      alert('Failed to load chart')
    } finally {
      setIsLoading(false)
    }
  }

  function renderTierList() {
    if (!chart) return null

    const tiers = [
      { name: 'S', value: 4, color: 'bg-red-100 border-red-300' },
      { name: 'A', value: 3, color: 'bg-orange-100 border-orange-300' },
      { name: 'B', value: 2, color: 'bg-yellow-100 border-yellow-300' },
      { name: 'C', value: 1, color: 'bg-green-100 border-green-300' }
    ]

    return (
      <div className="space-y-4">
        {tiers.map(tier => {
          const items = chart.items
            .filter(item => {
              const score = item.tier_mu || (item.r_x ? (item.r_x - 1000) / 100 + 2.5 : 2.5)
              return Math.round(score) === tier.value
            })
            .sort((a, b) => (b.tier_mu || b.r_x || 0) - (a.tier_mu || a.r_x || 0))

          return (
            <div key={tier.name} className={`p-4 border-2 rounded-lg ${tier.color}`}>
              <div className="flex items-start gap-4">
                <div className="text-2xl font-bold w-8">{tier.name}</div>
                <div className="flex flex-wrap gap-2">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="px-3 py-1 bg-white border rounded shadow-sm text-sm"
                    >
                      {renderItem(item, 'small')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderSingleAxis() {
    if (!chart) return null

    const sortedItems = [...chart.items].sort((a, b) => 
      (b.x_mu || b.r_x || 1000) - (a.x_mu || a.r_x || 1000)
    )

    return (
      <div className="space-y-4">
        <div className="text-center text-lg font-medium">{chart.x_label}</div>
        <div className="space-y-2">
          {sortedItems.map((item) => {
            const score = item.x_mu || (item.r_x ? (item.r_x - 1000) / 10 : 0)
            const position = ((score + 100) / 200) * 100 // Convert to 0-100%
            
            return (
              <div key={item.id} className="relative h-12 bg-gray-100 rounded">
                <div
                  className="absolute top-1/2 transform -translate-y-1/2 px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
                  style={{ left: `${Math.max(0, Math.min(90, position))}%` }}
                >
                  {renderItem(item, 'small')}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderTwoAxis() {
    if (!chart) return null

    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Y: {chart.y_label}</div>
          <div className="text-sm text-muted-foreground">X: {chart.x_label}</div>
        </div>
        <div className="relative w-full max-w-lg mx-auto aspect-square bg-gray-50 border border-gray-200">
          {/* Grid lines */}
          <div className="absolute inset-0">
            <div className="absolute top-1/2 w-full h-px bg-gray-300"></div>
            <div className="absolute left-1/2 h-full w-px bg-gray-300"></div>
            {/* Additional grid lines for better reference */}
            <div className="absolute top-1/4 w-full h-px bg-gray-200 opacity-50"></div>
            <div className="absolute top-3/4 w-full h-px bg-gray-200 opacity-50"></div>
            <div className="absolute left-1/4 h-full w-px bg-gray-200 opacity-50"></div>
            <div className="absolute left-3/4 h-full w-px bg-gray-200 opacity-50"></div>
          </div>
          
          {/* Items */}
          {chart.items.map((item) => {
            // Use Elo ratings and scale them properly
            const x = item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5  // Scale Elo to ±40 range
            const y = item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5  // Scale Elo to ±40 range
            
            // Add small jitter to prevent exact overlaps (deterministic based on item ID)
            const jitterSeed = item.id.charCodeAt(0) + item.id.charCodeAt(1) || 0
            const jitterX = (jitterSeed % 5) - 2.5  // -2.5 to 2.5
            const jitterY = ((jitterSeed * 7) % 5) - 2.5  // Different jitter for Y
            
            // Convert -100 to 100 range to 0% to 100%
            const xPos = (((x || 0) + jitterX + 100) / 200) * 100
            const yPos = 100 - (((y || 0) + jitterY + 100) / 200) * 100 // Flip Y for display
            
            return (
              <div
                key={item.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 px-2 py-1 bg-primary text-primary-foreground rounded text-xs whitespace-nowrap shadow-sm"
                style={{
                  left: `${Math.max(5, Math.min(95, xPos))}%`,
                  top: `${Math.max(5, Math.min(95, yPos))}%`
                }}
              >
                {renderItem(item, 'small')}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (isLoading) return <div className="container mx-auto py-8 text-center">Loading...</div>
  if (!chart) return <div className="container mx-auto py-8 text-center">Chart not found</div>

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-6 flex justify-between items-center">
        <Link to="/">
          <Button variant="ghost">
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/v/${id}?s=${shareKey}`}>
            <Button variant="default">
              Continue Voting
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => {
              const shareUrl = `/v/${id}?s=${shareKey}`
              navigator.clipboard.writeText(window.location.origin + shareUrl)
              alert('🗳️ Voting link copied! Share with friends to get more votes.')
            }}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share for Voting
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              const resultsUrl = window.location.href
              const text = `Check out these results: "${chart?.title}" on twoby`
              const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(resultsUrl)}`
              window.open(shareUrl, '_blank')
            }}
          >
            🐦 Tweet Results
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              const resultsUrl = window.location.href
              navigator.clipboard.writeText(resultsUrl)
              alert('🔗 Results link copied to clipboard!')
            }}
          >
            Copy Results Link
          </Button>
          
          {/* Image Toggle */}
          {chart?.items.some(i => i.image_url) && (
            <Button 
              variant={showImages ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? '🖼️ Images' : '📝 Text'}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const reason = prompt('Why are you reporting this chart?\n\n• Inappropriate content\n• Spam\n• Harassment\n• Other')
              if (reason) {
                alert('Thank you for your report. Our team will review this content.')
                console.log('Report:', { chartId: id, reason, url: window.location.href })
              }
            }}
          >
            <Flag className="w-4 h-4 mr-1" />
            Report
          </Button>
          
          <Link to="/create">
            <Button variant="outline">
              Create New
            </Button>
          </Link>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{chart.title}</CardTitle>
          <CardDescription>
            Results • Mode: {chart.mode === 'tier' ? 'Tier List' : chart.mode === 'single_axis' ? 'Single Axis' : '2×2 Grid'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.mode === 'tier' && renderTierList()}
          {chart.mode === 'single_axis' && renderSingleAxis()}
          {chart.mode === 'two_axis' && renderTwoAxis()}
        </CardContent>
      </Card>
    </div>
  )
}