import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, BarChart3, TrendingUp, Grid3X3, Users, Clock } from 'lucide-react'

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

function formatDate(dateString: string) {
  // Handle both old format (with +00:00Z) and new format (with just Z)
  const cleanDate = dateString.replace('+00:00Z', 'Z')
  const date = new Date(cleanDate)
  
  // If date is invalid, try without Z
  if (isNaN(date.getTime())) {
    return 'Recently'
  }
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
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
  return (
    <div className="relative w-full aspect-square bg-gray-50 rounded border max-w-32 mx-auto">
      {items.slice(0, 8).map((item) => {
        const x = item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5
        const y = item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5
        
        const xPos = ((x || 0) + 100) / 200 * 100
        const yPos = 100 - (((y || 0) + 100) / 200 * 100)
        
        return (
          <div
            key={item.id}
            className="absolute w-1.5 h-1.5 bg-blue-500 rounded-full"
            style={{
              left: `${Math.max(8, Math.min(88, xPos))}%`,
              top: `${Math.max(8, Math.min(88, yPos))}%`
            }}
            title={item.label}
          />
        )
      })}
      {/* Grid lines */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-px bg-gray-300"></div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-full w-px bg-gray-300"></div>
      </div>
      
      {/* Axis Labels */}
      {chart && (
        <>
          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-500 truncate max-w-16">
            {chart.x_label}
          </div>
          <div className="absolute left-1 top-1/2 transform -translate-y-1/2 -rotate-90 text-xs text-gray-500 truncate max-w-16">
            {chart.y_label}
          </div>
        </>
      )}
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
    return <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">No data yet</div>
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

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    loadCharts()
  }, [])

  async function loadCharts() {
    try {
      const response = await fetch(`${API_BASE}/api/charts/public`)
      if (response.ok) {
        const data = await response.json()
        setCharts(data)
        
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
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">twoby</h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Create collaborative opinion maps and see what your friends really think
          </p>
          <Link to="/create">
            <Button size="lg" className="text-lg px-8 py-4">
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
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Explore Public Charts</h2>
              <p className="text-gray-600 mb-4">
                {charts.length} chart{charts.length !== 1 ? 's' : ''} available • Vote to see results
              </p>
              <Link to="/create">
                <Button variant="outline" className="mr-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your Own
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-48 bg-white rounded-xl shadow animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {charts.map(chart => {
                  // Create share URL for viewing/voting
                  const shareUrl = `/v/${chart.id}?s=public`
                  const resultsUrl = `/c/${chart.id}?s=public`
                  
                  return (
                    <Card key={chart.id} className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            {getModeIcon(chart.mode)}
                            <span>{getModeLabel(chart.mode)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatDate(chart.created_at)}
                          </div>
                        </div>
                        <CardTitle className="text-lg leading-tight group-hover:text-blue-600 transition-colors">
                          {chart.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <span>{chart.item_count} items</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>{chart.vote_count} votes</span>
                          </div>
                        </div>
                        
                        {/* Chart Preview */}
                        <div className="mb-4">
                          <ChartPreviewComponent chart={chart} preview={previews[chart.id] || null} />
                        </div>
                        
                        <div className="flex gap-2">
                          <Link to={shareUrl} className="flex-1">
                            <Button variant="outline" className="w-full" size="sm">
                              Vote
                            </Button>
                          </Link>
                          <Link to={resultsUrl} className="flex-1">
                            <Button className="w-full" size="sm">
                              Results
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
        </div>
      </div>
    </div>
  )
}