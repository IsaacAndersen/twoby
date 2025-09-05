import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Home, Share2, Star } from 'lucide-react'
import { useMetaTags } from '@/hooks/useMetaTags'
import { resolveCollisions } from '@/utils/collision'
import Avatar from './Avatar'

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
  description?: string
  creator_take?: string
  items: Item[]
  tool_name?: string
  task_description?: string
  task_image_url?: string
}

export default function ViewChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const shareKey = searchParams.get('s')
  const adminKey = searchParams.get('k')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showImages, setShowImages] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)
  const [toolHelpfulness, setToolHelpfulness] = useState(0)
  const [freeResponse, setFreeResponse] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [adminFeedback, setAdminFeedback] = useState<any[]>([])
  const [showAdminFeedback, setShowAdminFeedback] = useState(false)

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  async function submitFeedback() {
    if (!id || !toolHelpfulness) return
    
    try {
      await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          tool_helpfulness: toolHelpfulness,
          free_response: freeResponse.trim()
        })
      })
      setFeedbackSubmitted(true)
      setTimeout(() => setShowFeedback(false), 2000)
      // Refresh admin feedback if we're in admin mode
      if (adminKey) {
        loadAdminFeedback()
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    }
  }

  async function loadAdminFeedback() {
    if (!id || !adminKey) return
    
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/feedback?k=${adminKey}`)
      if (response.ok) {
        const data = await response.json()
        setAdminFeedback(data.feedback)
      }
    } catch (error) {
      console.error('Failed to load feedback:', error)
    }
  }

  const exportCSV = async () => {
    if (!id || !adminKey) return
    
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/export-csv?k=${adminKey}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chart_${id}_export.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Failed to export CSV:', error)
    }
  }

  function renderItem(item: Item, size: 'small' | 'medium' = 'medium') {
    const hasImages = chart?.items.some(i => i.image_url)
    const shouldShowImages = hasImages && showImages
    
    if (shouldShowImages) {
      // Always show with avatar/monogram layout when in image mode
      return (
        <div className="flex items-center gap-2">
          <Avatar 
            src={item.image_url || undefined}
            name={item.label}
            size={size === 'small' ? 'sm' : 'md'}
          />
          <span className="font-medium">{item.label}</span>
        </div>
      )
    }
    
    return <span className="font-medium">{item.label}</span>
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
    if (adminKey) {
      loadAdminFeedback()
    }
  }, [id, shareKey, adminKey])

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
      { 
        name: 'S', 
        value: 4, 
        gradient: 'from-red-500 to-rose-600',
        bg: 'bg-gradient-to-br from-red-50 to-rose-50',
        border: 'border-red-200',
        glow: 'shadow-red-100'
      },
      { 
        name: 'A', 
        value: 3, 
        gradient: 'from-orange-500 to-amber-600',
        bg: 'bg-gradient-to-br from-orange-50 to-amber-50',
        border: 'border-orange-200',
        glow: 'shadow-orange-100'
      },
      { 
        name: 'B', 
        value: 2, 
        gradient: 'from-yellow-500 to-yellow-600',
        bg: 'bg-gradient-to-br from-yellow-50 to-yellow-50',
        border: 'border-yellow-200',
        glow: 'shadow-yellow-100'
      },
      { 
        name: 'C', 
        value: 1, 
        gradient: 'from-emerald-500 to-green-600',
        bg: 'bg-gradient-to-br from-emerald-50 to-green-50',
        border: 'border-emerald-200',
        glow: 'shadow-emerald-100'
      }
    ]

    // Ensure all items are accounted for
    const allAssignedItems = new Set<string>()
    const tierData = tiers.map(tier => {
      const items = chart.items
        .filter(item => {
          // More robust score calculation with fallbacks
          let score = 2.5 // Default to middle tier
          if (item.tier_mu !== null && item.tier_mu !== undefined) {
            score = item.tier_mu
          } else if (item.r_x !== null && item.r_x !== undefined) {
            // Convert Elo rating to tier (1000 = tier 2.5)
            score = Math.max(1, Math.min(4, (item.r_x - 900) / 100 + 2.5))
          }
          const assigned = Math.round(score) === tier.value
          if (assigned) allAssignedItems.add(item.id)
          return assigned
        })
        .sort((a, b) => {
          const scoreA = a.tier_mu || (a.r_x ? (a.r_x - 1000) / 100 + 2.5 : 2.5)
          const scoreB = b.tier_mu || (b.r_x ? (b.r_x - 1000) / 100 + 2.5 : 2.5)
          return scoreB - scoreA
        })
      return { tier, items }
    })

    // Add any unassigned items to B tier as fallback
    const unassignedItems = chart.items.filter(item => !allAssignedItems.has(item.id))
    if (unassignedItems.length > 0) {
      const bTierIndex = tierData.findIndex(t => t.tier.name === 'B')
      if (bTierIndex >= 0) {
        tierData[bTierIndex].items.push(...unassignedItems)
      }
    }

    return (
      <div className="space-y-6">
        {tierData.map(({ tier, items }) => {
          const hasItems = items.length > 0
          
          return (
            <div 
              key={tier.name} 
              className={`relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl ${tier.bg} ${tier.border} border-2 ${
                !hasItems ? 'min-h-[60px]' : ''
              }`}
            >
              {/* Tier Label */}
              <div className={`absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-br ${tier.gradient} flex items-center justify-center`}>
                <span className="text-4xl font-black text-white drop-shadow-lg">{tier.name}</span>
              </div>
              
              {/* Items Container */}
              <div className={`ml-20 ${hasItems ? 'p-6' : 'p-3'}`}>
                {hasItems ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-gray-700">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {items.map((item, index) => (
                        <div
                          key={item.id}
                          className="group relative bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-1 overflow-hidden"
                          style={{
                            animationDelay: `${index * 50}ms`,
                            animation: 'fadeInUp 0.5s ease-out forwards'
                          }}
                        >
                          <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <span>{renderItem(item, 'small')}</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              {(item.tier_mu || 2.5).toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-6">
                    <span className="text-gray-400 text-sm italic">No items yet</span>
                  </div>
                )}
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
    
    // Parse axis labels
    const axisLabels = chart.x_label?.split(' → ') || ['Low', 'High']

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {axisLabels[0]} ← — — — — — — — — — → {axisLabels[1]}
          </div>
          <div className="text-sm text-gray-500">
            Ranked from highest to lowest score
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Colors show relative performance: <span className="text-green-600">excellent</span> • <span className="text-blue-600">good</span> • <span className="text-amber-600">moderate</span> • <span className="text-red-600">low</span>
          </div>
        </div>
        
        <div className="space-y-3">
          {sortedItems.map((item, index) => {
            const score = item.x_mu || (item.r_x ? (item.r_x - 1000) / 10 : 0)
            const position = ((score + 100) / 200) * 100 // Convert to 0-100%
            
            // Color gradient based on position
            let bgGradient = 'from-gray-500 to-gray-600'
            if (position > 75) bgGradient = 'from-green-500 to-emerald-600'
            else if (position > 50) bgGradient = 'from-blue-500 to-blue-600'
            else if (position > 25) bgGradient = 'from-amber-500 to-orange-600'
            else bgGradient = 'from-red-500 to-red-600'

            return (
              <div 
                key={item.id} 
                className="relative group"
                style={{
                  animationDelay: `${index * 50}ms`,
                  animation: 'slideInFromLeft 0.5s ease-out forwards'
                }}
              >
                {/* Background bar */}
                <div className="relative h-14 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Filled portion */}
                  <div 
                    className={`absolute top-0 left-0 h-full bg-gradient-to-r ${bgGradient} opacity-20 transition-all duration-500`}
                    style={{ width: `${position}%` }}
                  />
                  
                  {/* Item bubble */}
                  <div
                    className={`absolute top-1/2 transform -translate-y-1/2 transition-all duration-300 hover:scale-105`}
                    style={{ left: `${Math.max(2, Math.min(88, position))}%` }}
                  >
                    <div className={`bg-gradient-to-br ${bgGradient} text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2`}>
                      {renderItem(item, 'small')}
                      <span className="text-xs opacity-75 font-medium">
                        ({score.toFixed(0)})
                      </span>
                    </div>
                  </div>
                  
                  {/* Position indicator line */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-black/30 transition-all duration-300"
                    style={{ left: `${position}%` }}
                  />
                </div>
                
                {/* Hover detail */}
                <div className="absolute -top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded shadow-sm">
                    Rank #{index + 1} • Score: {score.toFixed(1)}
                  </span>
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

    // Parse axis labels to get low/high values
    const xLabels = chart.x_label?.split(' → ') || ['Low', 'High']
    const yLabels = chart.y_label?.split(' → ') || ['Low', 'High']
    
    return (
      <div className="space-y-6">
        {/* Enhanced Axis Labels and Legend */}
        <div className="text-center space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium text-gray-600">Y-Axis:</span>
              <span className="text-base font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                {yLabels[0]} → {yLabels[1]}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium text-gray-600">X-Axis:</span>
              <span className="text-base font-bold bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">
                {xLabels[0]} → {xLabels[1]}
              </span>
            </div>
          </div>
          
        </div>
        
        <div className="relative w-full max-w-2xl mx-auto aspect-square rounded-2xl overflow-hidden shadow-2xl">
          {/* Quadrant Backgrounds */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
            {/* Top Left - Low X, High Y */}
            <div className="bg-gradient-to-br from-purple-50 via-purple-50/50 to-transparent"></div>
            {/* Top Right - High X, High Y */}
            <div className="bg-gradient-to-bl from-emerald-50 via-emerald-50/50 to-transparent"></div>
            {/* Bottom Left - Low X, Low Y */}
            <div className="bg-gradient-to-tr from-gray-50 via-gray-50/50 to-transparent"></div>
            {/* Bottom Right - High X, Low Y */}
            <div className="bg-gradient-to-tl from-amber-50 via-amber-50/50 to-transparent"></div>
          </div>
          {/* Grid lines with labels */}
          <div className="absolute inset-0">
            {/* Center lines with increased weight */}
            <div className="absolute top-1/2 w-full h-1 bg-gradient-to-r from-transparent via-gray-500 to-transparent"></div>
            <div className="absolute left-1/2 h-full w-1 bg-gradient-to-b from-transparent via-gray-500 to-transparent"></div>
            
            {/* Subtle grid lines */}
            <div className="absolute top-1/4 w-full h-px bg-gray-300 opacity-40"></div>
            <div className="absolute top-3/4 w-full h-px bg-gray-300 opacity-40"></div>
            <div className="absolute left-1/4 h-full w-px bg-gray-300 opacity-40"></div>
            <div className="absolute left-3/4 h-full w-px bg-gray-300 opacity-40"></div>
            
            {/* Axis end labels */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-500 bg-white/80 px-2 py-0.5 rounded-full">
              {yLabels[1]}
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-500 bg-white/80 px-2 py-0.5 rounded-full">
              {yLabels[0]}
            </div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 bg-white/80 px-2 py-0.5 rounded-full">
              {xLabels[0]}
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 bg-white/80 px-2 py-0.5 rounded-full">
              {xLabels[1]}
            </div>
          </div>
          
          {/* Items with collision detection */}
          {(() => {
            // Prepare items for collision detection
            const itemsForCollision = chart.items.map(item => {
              const x = item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5
              const y = item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5
              
              // Convert to 0-100 range for collision detection
              const xPos = ((x || 0) + 100) / 200 * 100
              const yPos = 100 - ((y || 0) + 100) / 200 * 100
              
              return {
                id: item.id,
                x: xPos,
                y: yPos,
                label: item.label
              }
            })
            
            // Resolve collisions with appropriate label sizes for 2x2 grid
            const adjustedPositions = resolveCollisions(itemsForCollision, 100, 100, 15, 5)
            
            return chart.items.map((item, index) => {
              const adjusted = adjustedPositions.find(p => p.id === item.id)
              const xPos = adjusted?.x || 50
              const yPos = adjusted?.y || 50
            
            // Determine quadrant for consistent color coding
            const isHighX = xPos > 50
            const isHighY = yPos < 50
            let bgColor = 'from-gray-500 to-gray-600' // Bottom-left: Low/Low
            
            if (isHighX && isHighY) {
              bgColor = 'from-emerald-500 to-emerald-600' // Top-right: High/High
            } else if (!isHighX && isHighY) {
              bgColor = 'from-purple-500 to-purple-600' // Top-left: Low X/High Y
            } else if (isHighX && !isHighY) {
              bgColor = 'from-amber-500 to-amber-600' // Bottom-right: High X/Low Y
            }

              return (
                <div
                  key={item.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-all duration-300 hover:scale-110 hover:z-20`}
                  style={{
                    left: `${Math.max(5, Math.min(95, xPos))}%`,
                    top: `${Math.max(5, Math.min(95, yPos))}%`,
                    animationDelay: `${index * 100}ms`,
                    animation: 'popIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards'
                  }}
                >
                  <div className={`bg-gradient-to-br ${bgColor} text-white px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-sm ${
                    adjusted?.clustered ? 'ring-2 ring-white/30' : ''
                  }`}>
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {renderItem(item, 'small')}
                      {adjusted?.clustered && adjusted.clusterMembers && adjusted.clusterMembers.length > 2 && (
                        <span className="ml-0.5 text-[10px] opacity-75 bg-white/20 px-1 rounded">
                          +{adjusted.clusterMembers.length - 1}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Enhanced tooltip with cluster info */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                    <div className="bg-black/90 text-white text-xs px-2 py-1 rounded">
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-gray-300 mt-0.5">
                        X: {((item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5) || 0).toFixed(0)} | 
                        Y: {((item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5) || 0).toFixed(0)}
                      </div>
                      {adjusted?.clustered && adjusted.clusterMembers && adjusted.clusterMembers.length > 1 && (
                        <div className="text-yellow-300 mt-1 pt-1 border-t border-gray-600 text-[10px]">
                          Near: {adjusted.clusterMembers.filter(m => m !== item.label).slice(0, 2).join(', ')}
                          {adjusted.clusterMembers.length > 3 && ` +${adjusted.clusterMembers.length - 3}`}
                        </div>
                      )}
                    </div>
                    <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90 mx-auto"></div>
                  </div>
                </div>
              )
            })
          })()}
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
        <div className="flex gap-2 flex-wrap items-center">
          <Link to={`/v/${id}?s=${shareKey}`}>
            <Button>
              Continue Voting
            </Button>
          </Link>
          
          {/* Share Dropdown */}
          <div className="relative group">
            <Button variant="outline">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 min-w-48">
              <div className="p-1">
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                  onClick={() => {
                    const shareUrl = `/v/${id}?s=${shareKey}`
                    navigator.clipboard.writeText(window.location.origin + shareUrl)
                    // Could add toast notification here
                  }}
                >
                  🗳️ Copy voting link
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                  onClick={() => {
                    const resultsUrl = window.location.href
                    navigator.clipboard.writeText(resultsUrl)
                  }}
                >
                  🔗 Copy results link
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                  onClick={() => {
                    const resultsUrl = window.location.href
                    const text = `Check out these results: "${chart?.title}" on twoby`
                    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(resultsUrl)}`
                    window.open(shareUrl, '_blank')
                  }}
                >
                  🐦 Tweet results
                </button>
              </div>
            </div>
          </div>
          
          {/* Image Toggle - only show if there are images */}
          {chart?.items.some(i => i.image_url) && (
            <Button 
              variant="ghost"
              size="sm"
              onClick={() => setShowImages(!showImages)}
              title={showImages ? "Show text only" : "Show images"}
            >
              {showImages ? '🖼️' : '📝'}
            </Button>
          )}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{chart.title}</CardTitle>
          {chart.description && (
            <div className="mt-2 text-gray-600">
              {chart.description}
            </div>
          )}
          <CardDescription>
            Results • Mode: {chart.mode === 'tier' ? 'Tier List' : chart.mode === 'single_axis' ? 'Single Axis' : '2×2 Grid'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.mode === 'tier' && renderTierList()}
          {chart.mode === 'single_axis' && renderSingleAxis()}
          {chart.mode === 'two_axis' && renderTwoAxis()}
          
          {chart.creator_take && (
            <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">💭</div>
                <div>
                  <div className="text-sm font-medium text-blue-900 mb-1">Creator's Take</div>
                  <div className="text-gray-700 leading-relaxed">
                    {chart.creator_take}
                  </div>
                </div>
              </div>
            </div>
          )}

          {chart.task_description && (
            <div className="mt-8 p-4 bg-gradient-to-r from-green-50 to-teal-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-2xl">📋</div>
                <div>
                  <div className="text-sm font-medium text-green-900 mb-1">Task Description</div>
                  <div className="text-gray-700 leading-relaxed">
                    {chart.task_description}
                  </div>
                  {chart.task_image_url && (
                    <img 
                      src={chart.task_image_url} 
                      alt="Task illustration" 
                      className="mt-3 max-w-full h-auto rounded border"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Section */}
          <div className="mt-8">
            {!showFeedback ? (
              <Button 
                onClick={() => setShowFeedback(true)}
                variant="outline"
                className="w-full"
              >
                💬 How helpful was {chart.tool_name || 'the tool'}?
              </Button>
            ) : (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg text-orange-900">
                    How helpful was {chart.tool_name || 'the tool'}?
                  </CardTitle>
                  <CardDescription className="text-orange-700">
                    Your feedback helps improve future recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {feedbackSubmitted ? (
                    <div className="text-center py-4">
                      <div className="text-2xl mb-2">✅</div>
                      <div className="text-green-700 font-medium">Thank you for your feedback!</div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-orange-900">Rating</label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => setToolHelpfulness(rating)}
                              className={`p-2 rounded-full transition-colors ${
                                toolHelpfulness >= rating 
                                  ? 'text-yellow-500 bg-yellow-100' 
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                            >
                              <Star className="w-5 h-5" fill={toolHelpfulness >= rating ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label htmlFor="feedback-notes" className="text-sm font-medium text-orange-900">
                          Additional Notes (optional)
                        </label>
                        <Textarea
                          id="feedback-notes"
                          value={freeResponse}
                          onChange={(e) => setFreeResponse(e.target.value)}
                          placeholder="Share more details about your experience..."
                          className="min-h-[80px] text-sm border-orange-200 focus:border-orange-300"
                          maxLength={2000}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={submitFeedback}
                          disabled={!toolHelpfulness}
                          className="flex-1"
                        >
                          Submit Feedback
                        </Button>
                        <Button 
                          onClick={() => setShowFeedback(false)}
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Admin Section */}
          {adminKey && (
            <div className="mt-8 border-t border-gray-200 pt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Admin Panel</h3>
                <div className="flex gap-2">
                  <Button 
                    onClick={exportCSV}
                    variant="outline"
                    size="sm"
                  >
                    📊 Export CSV
                  </Button>
                  <Button 
                    onClick={() => setShowAdminFeedback(!showAdminFeedback)}
                    variant="outline"
                    size="sm"
                  >
                    {showAdminFeedback ? '👁️ Hide' : '👁️ View'} Feedback ({adminFeedback.length})
                  </Button>
                </div>
              </div>

              {showAdminFeedback && (
                <Card className="bg-gray-50">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-md">User Feedback</CardTitle>
                    <CardDescription>
                      Tool helpfulness ratings and free-response notes from users
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {adminFeedback.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No feedback received yet</p>
                    ) : (
                      <div className="space-y-4">
                        {adminFeedback.map((feedback, index) => (
                          <div key={index} className="bg-white p-4 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Tool Helpfulness:</span>
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star 
                                      key={star} 
                                      className={`w-4 h-4 ${
                                        feedback.tool_helpfulness >= star 
                                          ? 'text-yellow-500 fill-current' 
                                          : 'text-gray-300'
                                      }`} 
                                    />
                                  ))}
                                </div>
                                <span className="text-sm text-gray-600">
                                  ({feedback.tool_helpfulness || 'No rating'}/5)
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {new Date(feedback.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {feedback.free_response && (
                              <div className="mt-2">
                                <span className="text-sm font-medium text-gray-700">Notes:</span>
                                <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">
                                  {feedback.free_response}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {adminFeedback.length > 0 && (
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <div className="text-sm font-medium text-blue-900">Summary</div>
                            <div className="text-sm text-blue-700 mt-1">
                              Average rating: {(adminFeedback.reduce((sum, f) => sum + (f.tool_helpfulness || 0), 0) / adminFeedback.filter(f => f.tool_helpfulness).length).toFixed(1)} / 5
                            </div>
                            <div className="text-sm text-blue-700">
                              {adminFeedback.filter(f => f.free_response && f.free_response.trim()).length} detailed responses
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}