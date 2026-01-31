import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, BarChart3, TrendingUp, Grid3X3, Users, Clock, Flame, Sparkles, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/utils/timeFormatting'

interface ChartSummary {
  id: string
  title: string
  mode: 'tier' | 'single_axis' | 'two_axis'
  item_count: number
  vote_count: number
  created_at: string
}

interface ChartPreview {
  id: string
  title: string
  mode: string
  items: Array<{
    id: string
    label: string
    r_x?: number
    r_y?: number
    x_mu?: number
    y_mu?: number
    tier_mu?: number
  }>
}

function getModeIcon(mode: string) {
  switch (mode) {
    case 'tier': return <BarChart3 className="w-5 h-5" />
    case 'single_axis': return <TrendingUp className="w-5 h-5" />
    case 'two_axis': return <Grid3X3 className="w-5 h-5" />
    default: return <BarChart3 className="w-5 h-5" />
  }
}

function getModeLabel(mode: string) {
  switch (mode) {
    case 'tier': return 'Tier List'
    case 'single_axis': return 'Single Axis'
    case 'two_axis': return '2×2 Grid'
    default: return mode
  }
}


// Mini preview components for different chart types
function MiniTierList({ items }: { items: any[] }) {
  const tiers = [
    { name: 'S', value: 4, color: 'bg-red-100' },
    { name: 'A', value: 3, color: 'bg-orange-100' },
    { name: 'B', value: 2, color: 'bg-yellow-100' },
    { name: 'C', value: 1, color: 'bg-green-100' }
  ]
  
  return (
    <div className="space-y-1 text-xs">
      {tiers.map(tier => {
        const tierItems = items.filter(item => {
          const score = item.tier_mu || (item.r_x ? (item.r_x - 1000) / 100 + 2.5 : 2.5)
          return Math.round(score) === tier.value
        }).slice(0, 2) // Show max 2 items per tier
        
        return (
          <div key={tier.name} className={`flex items-center gap-1 p-1 rounded ${tier.color}`}>
            <span className="font-bold w-4">{tier.name}</span>
            <div className="flex gap-1 overflow-hidden">
              {tierItems.map(item => (
                <span key={item.id} className="bg-white px-1 rounded text-xs truncate max-w-16">
                  {item.label}
                </span>
              ))}
              {tierItems.length === 0 && <span className="text-gray-400">—</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MiniScatterPlot({ items, chart }: { items: any[], chart?: any }) {
  // Parse axis labels
  const xLabels = chart?.x_label?.split(' → ') || ['', '']
  const yLabels = chart?.y_label?.split(' → ') || ['', '']

  return (
    <div className="relative w-full aspect-square bg-white rounded border border-gray-200 max-w-40 mx-auto">
      {/* Y-axis with arrow */}
      <div className="absolute left-1/2 top-3 bottom-3 w-px bg-black -translate-x-1/2" />
      <div className="absolute left-1/2 top-2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-transparent border-b-black" />

      {/* X-axis with arrow */}
      <div className="absolute top-1/2 left-3 right-3 h-px bg-black -translate-y-1/2" />
      <div className="absolute top-1/2 right-2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-transparent border-l-black" />

      {/* Axis labels at ends */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[8px] font-medium text-gray-700 truncate max-w-12 text-center">
        {yLabels[1]}
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] font-medium text-gray-700 truncate max-w-12 text-center">
        {yLabels[0]}
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[8px] font-medium text-gray-700 truncate max-w-8 text-center pl-0.5">
        {xLabels[0]}
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[8px] font-medium text-gray-700 truncate max-w-8 text-center pr-0.5">
        {xLabels[1]}
      </div>

      {/* Items */}
      {items.slice(0, 8).map((item) => {
        const x = item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5
        const y = item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5

        const xPos = ((x || 0) + 100) / 200 * 100
        const yPos = 100 - (((y || 0) + 100) / 200 * 100)

        return (
          <div
            key={item.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${Math.max(15, Math.min(85, xPos))}%`,
              top: `${Math.max(15, Math.min(85, yPos))}%`
            }}
            title={item.label}
          >
            <span className="text-[7px] font-semibold text-gray-800 bg-white/90 px-0.5 rounded whitespace-nowrap">
              {item.label.length > 8 ? item.label.substring(0, 6) + '…' : item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MiniBarChart({ items }: { items: any[] }) {
  const sortedItems = items
    .map(item => ({
      ...item,
      score: item.x_mu || (item.r_x ? (item.r_x - 1000) / 10 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  
  const maxScore = Math.max(...sortedItems.map(item => Math.abs(item.score)))
  
  return (
    <div className="space-y-1">
      {sortedItems.map((item) => {
        const width = maxScore > 0 ? (Math.abs(item.score) / maxScore) * 100 : 20
        return (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            <span className="w-12 truncate">{item.label}</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full" 
                style={{ width: `${Math.max(10, width)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChartPreviewComponent({ chart, preview }: { chart: ChartSummary, preview: ChartPreview | null }) {
  if (!preview || preview.items.length === 0) {
    return (
      <div className="h-12 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg flex items-center justify-center border border-gray-100">
        <div className="text-center flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></div>
          <div className="text-xs text-gray-400 font-medium">Vote to see results</div>
        </div>
      </div>
    )
  }
  
  switch (chart.mode) {
    case 'tier':
      return <MiniTierList items={preview.items} />
    case 'two_axis':
      return <MiniScatterPlot items={preview.items} chart={preview} />
    case 'single_axis':
      return <MiniBarChart items={preview.items} />
    default:
      return <div className="h-24 bg-gray-100 rounded" />
  }
}

export default function HomePage() {
  const [charts, setCharts] = useState<ChartSummary[]>([])
  const [previews, setPreviews] = useState<Record<string, ChartPreview>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'trending' | 'new' | 'featured'>('trending')

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    loadCharts()
    
    // Listen for admin changes (simple approach using storage events)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('admin_')) {
        loadCharts() // Reload when admin data changes
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  async function loadCharts() {
    try {
      const response = await fetch(`${API_BASE}/api/charts/public`)
      if (response.ok) {
        const data = await response.json()
        
        // Get admin data from localStorage
        const deletedCharts = JSON.parse(localStorage.getItem('admin_deleted_charts') || '[]')
        const savedHotCharts = JSON.parse(localStorage.getItem('admin_hot_charts') || '[]')
        const savedFeaturedCharts = JSON.parse(localStorage.getItem('admin_featured_charts') || '[]')
        
        // Filter out deleted charts first
        const filteredData = data.filter((chart: ChartSummary) => !deletedCharts.includes(chart.id))
        
        // Add enhanced metadata for social proof
        const enhancedData = filteredData.map((chart: ChartSummary) => ({
          ...chart,
          views: Math.floor(Math.random() * 1000) + chart.vote_count * 3, // Simulated view count
          trending: savedHotCharts.includes(chart.id), // Use real hot data from admin
          featured: savedFeaturedCharts.includes(chart.id), // Use real featured data from admin
          voteRate: chart.vote_count > 0 ? (chart.vote_count / Math.max(1, (Date.now() - new Date(chart.created_at).getTime()) / (1000 * 60 * 60))).toFixed(1) : 0
        }))
        setCharts(enhancedData)
        
        // Load previews for charts that have items
        const previewPromises = data
          .filter((chart: ChartSummary) => chart.item_count > 0)
          .slice(0, 8) // Only load previews for first 8 charts
          .map(async (chart: ChartSummary) => {
            try {
              const previewResponse = await fetch(`${API_BASE}/api/charts/${chart.id}/public?s=public`)
              if (previewResponse.ok) {
                const previewData = await previewResponse.json()
                return { chartId: chart.id, preview: previewData }
              }
            } catch (error) {
              console.error(`Failed to load preview for ${chart.id}:`, error)
            }
            return null
          })

        const previewResults = await Promise.all(previewPromises)
        const previewMap: Record<string, ChartPreview> = {}
        previewResults.forEach(result => {
          if (result) {
            previewMap[result.chartId] = result.preview
          }
        })
        setPreviews(previewMap)
      }
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto py-8 px-4">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">twoby</h1>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Create collaborative opinion maps and see what your friends really think
          </p>
          <Link to="/create">
            <Button size="lg" className="text-lg px-8 py-4 mb-4">
              <Plus className="w-5 h-5 mr-2" />
              Create Chart
            </Button>
          </Link>
        </div>

        {/* Empty State */}
        {charts.length === 0 && !isLoading && (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Be the first!</h2>
              <p className="text-gray-600 mb-6">
                Create the first public chart and start the conversation
              </p>
              <Link to="/create">
                <Button size="lg">
                  <Plus className="w-5 h-5 mr-2" />
                  Create First Chart
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Charts Grid */}
        {(charts.length > 0 || isLoading) && (
          <div>
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-3 text-center">Explore Public Charts</h2>
              <p className="text-gray-600 mb-12 text-center">
                {charts.length} chart{charts.length !== 1 ? 's' : ''} available • Vote to see results
              </p>
              
              {/* Filter Tabs Row */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex rounded-lg border bg-gray-100 p-1">
                  <button
                    onClick={() => setActiveFilter('trending')}
                    className={`px-6 py-3 rounded-md text-sm font-medium transition-colors flex items-center ${
                      activeFilter === 'trending'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Flame className="w-4 h-4 mr-2" />
                    Trending
                  </button>
                  <button
                    onClick={() => setActiveFilter('new')}
                    className={`px-6 py-3 rounded-md text-sm font-medium transition-colors flex items-center ${
                      activeFilter === 'new'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    New
                  </button>
                  <button
                    onClick={() => setActiveFilter('featured')}
                    className={`px-6 py-3 rounded-md text-sm font-medium transition-colors flex items-center ${
                      activeFilter === 'featured'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Featured
                  </button>
                </div>
              </div>
              
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-48 bg-white rounded-xl shadow animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {charts
                  .filter(chart => {
                    if (activeFilter === 'trending') return (chart as any).trending || chart.vote_count > 5
                    if (activeFilter === 'featured') return (chart as any).featured || chart.vote_count > 10
                    return true // 'new' shows all sorted by date
                  })
                  .sort((a, b) => {
                    if (activeFilter === 'trending') {
                      return ((b as any).voteRate || 0) - ((a as any).voteRate || 0)
                    }
                    if (activeFilter === 'featured') {
                      return b.vote_count - a.vote_count
                    }
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  })
                  .map((chart, index) => {
                  // Create share URL for viewing/voting
                  const shareUrl = `/v/${chart.id}?s=public`
                  const resultsUrl = `/c/${chart.id}?s=public`
                  
                  return (
                    <Card key={chart.id} className="hover:shadow-lg transition-shadow cursor-pointer group relative overflow-hidden">
                      {/* Trending/Featured Badges */}
                      {(chart as any).trending && index < 3 && activeFilter === 'trending' && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
                            <Flame className="w-3 h-3 mr-1" />
                            Hot
                          </Badge>
                        </div>
                      )}
                      {(chart as any).featured && activeFilter === 'featured' && index === 0 && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge className="bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
                            <Star className="w-3 h-3 mr-1" />
                            Featured
                          </Badge>
                        </div>
                      )}
                      {activeFilter === 'new' && index === 0 && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
                            <Sparkles className="w-3 h-3 mr-1" />
                            New
                          </Badge>
                        </div>
                      )}
                      
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            {getModeIcon(chart.mode)}
                            <span>{getModeLabel(chart.mode)}</span>
                          </div>
                          <div 
                            className="flex items-center gap-1 text-xs cursor-help"
                            title={formatRelativeTime(chart.created_at).absolute}
                          >
                            <Clock className="w-3 h-3" />
                            <span className={formatRelativeTime(chart.created_at).className}>
                              {formatRelativeTime(chart.created_at).relative}
                            </span>
                          </div>
                        </div>
                        <CardTitle className="text-lg leading-tight group-hover:text-blue-600 transition-colors">
                          {chart.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span className="font-medium">
                              {chart.vote_count} {chart.vote_count === 1 ? 'vote' : 'votes'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Chart Preview */}
                        <div className="mb-4">
                          <ChartPreviewComponent chart={chart} preview={previews[chart.id] || null} />
                        </div>
                        
                        <div className="flex gap-3">
                          <Link to={shareUrl} className="flex-1">
                            <Button variant="outline" className="w-full h-10 text-sm font-medium">
                              {chart.vote_count === 0 ? 'Be First to Vote' : 'Vote'}
                            </Button>
                          </Link>
                          <Link to={resultsUrl} className="flex-1">
                            <Button className="w-full h-10 text-sm font-medium">
                              {chart.vote_count === 0 ? 'Preview' : 'Results'}
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {/* Footer */}
        <div className="text-center mt-12 pt-8">
          <p className="text-sm text-gray-500">
            Collaborative rankings • No account required • Instant results
          </p>
          <div className="mt-4">
            <Link to="/admin" className="text-xs text-gray-400 hover:text-gray-600 underline">
              Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}