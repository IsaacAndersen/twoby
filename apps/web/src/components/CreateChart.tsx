import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ChartBar, BarChart3, Grid2x2, Shuffle } from 'lucide-react'

type ChartMode = 'tier' | 'single_axis' | 'two_axis'

// Title suggestions for inspiration
const TITLE_SUGGESTIONS = [
  'Best Programming Languages',
  'Most Underrated Movies',
  'Top Pizza Toppings',
  'Greatest Video Games',
  'Most Useful Kitchen Gadgets',
  'Best Study Music',
  'Top Travel Destinations',
  'Most Helpful Apps',
  'Greatest TV Shows',
  'Best Coffee Shops',
  'Top Books to Read',
  'Most Fun Board Games',
  'Greatest Athletes',
  'Best Productivity Tools',
  'Top Desserts',
  'Most Beautiful Landscapes',
  'Best Workout Songs',
  'Greatest Inventions',
  'Top Comfort Foods',
  'Most Relaxing Activities'
]

export default function CreateChart() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [currentSuggestion, setCurrentSuggestion] = useState('')
  const [mode, setMode] = useState<ChartMode>('tier')
  const [xLabel, setXLabel] = useState('')
  const [xLowLabel, setXLowLabel] = useState('')
  const [xHighLabel, setXHighLabel] = useState('')
  const [yLowLabel, setYLowLabel] = useState('')
  const [yHighLabel, setYHighLabel] = useState('')
  const [items, setItems] = useState('')
  const [votingPeriod, setVotingPeriod] = useState<string>('none')
  const [isLoading, setIsLoading] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [chartLinks, setChartLinks] = useState({ shareUrl: '', adminUrl: '' })

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  // Initialize with a random suggestion
  useEffect(() => {
    setCurrentSuggestion(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)])
  }, [])

  // Function to get new random suggestion
  const getNewSuggestion = () => {
    let newSuggestion
    do {
      newSuggestion = TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)]
    } while (newSuggestion === currentSuggestion && TITLE_SUGGESTIONS.length > 1)
    setCurrentSuggestion(newSuggestion)
  }

  // Chart type configurations
  const CHART_TYPES = [
    {
      id: 'tier' as ChartMode,
      name: 'Tier List',
      description: 'S/A/B/C ranking system',
      icon: ChartBar,
      gradient: 'from-blue-500 to-purple-600'
    },
    {
      id: 'single_axis' as ChartMode,
      name: 'Single Axis',
      description: 'Rank items from low to high',
      icon: BarChart3,
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      id: 'two_axis' as ChartMode,
      name: '2×2 Grid',
      description: 'Plot items on two dimensions',
      icon: Grid2x2,
      gradient: 'from-orange-500 to-red-600'
    }
  ]

  // Basic content filter
  const profanityWords = [
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'hell', 'crap', 'piss', 'whore', 'slut',
    'dick', 'cock', 'pussy', 'tits', 'boobs', 'nazi', 'retard', 'gay', 'fag', 'nigger'
  ]


  function filterContent(text: string): string {
    let filtered = text
    profanityWords.forEach(word => {
      const regex = new RegExp(word, 'gi')
      filtered = filtered.replace(regex, '*'.repeat(word.length))
    })
    return filtered
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !items.trim()) return

    // Content filtering
    const filteredTitle = filterContent(title.trim())
    const filteredItems = items.split('\n')
      .filter(line => line.trim())
      .map(line => filterContent(line.trim()))
      .join('\n')

    // Show warning if content was filtered
    if (filteredTitle !== title.trim() || filteredItems !== items.trim()) {
      const proceed = confirm('Some content was filtered for inappropriate language. Continue with filtered content?')
      if (!proceed) return
    }

    setIsLoading(true)
    try {
      // Create chart
      const chartResponse = await fetch(`${API_BASE}/api/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: filteredTitle,
          mode,
          x_label: mode === 'tier' 
            ? xLabel.trim() || ""
            : mode === 'single_axis'
              ? `${xLowLabel.trim() || 'Low'} → ${xHighLabel.trim() || 'High'}`
              : `${xLowLabel.trim() || 'Low'} → ${xHighLabel.trim() || 'High'}`,
          y_label: mode === 'two_axis' 
            ? `${yLowLabel.trim() || 'Low'} → ${yHighLabel.trim() || 'High'}`
            : "",
          visibility: 'public',
          voting_period_days: votingPeriod && votingPeriod !== 'none' ? parseInt(votingPeriod) : null
        })
      })

      if (!chartResponse.ok) throw new Error('Failed to create chart')
      const chart = await chartResponse.json()

      // Add items
      const adminKey = new URL(chart.admin_url, window.location.origin).searchParams.get('k')
      const itemList = filteredItems.split('\n').filter(line => line.trim()).map(line => {
        const trimmed = line.trim()
        const urlMatch = trimmed.match(/^(.+?)\s+(https?:\/\/\S+)$/)
        
        if (urlMatch) {
          return { 
            label: urlMatch[1].trim(),
            image_url: urlMatch[2].trim()
          }
        } else {
          return { label: trimmed }
        }
      })

      const itemsResponse = await fetch(`${API_BASE}/api/charts/${chart.id}/items?k=${adminKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemList })
      })

      if (!itemsResponse.ok) throw new Error('Failed to add items')

      // Show links and navigation options
      setChartLinks({ shareUrl: chart.share_url, adminUrl: chart.admin_url })
      setShowLinks(true)

    } catch (error) {
      console.error('Error:', error)
      alert('Failed to create chart. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-6">
        <Link to="/">
          <Button variant="ghost" className="p-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Create Opinion Map</CardTitle>
          <CardDescription>
            Set up a collaborative chart for voting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Chart Title
                </label>
                <div className="relative">
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={currentSuggestion}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={getNewSuggestion}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                  >
                    <Shuffle className="w-3 h-3" />
                  </Button>
                </div>
                
                {currentSuggestion && !title && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTitle(currentSuggestion)}
                    className="text-xs text-blue-600 hover:bg-blue-50 h-auto p-1"
                  >
                    Use "{currentSuggestion}"
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Chart Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {CHART_TYPES.map((type) => {
                    const Icon = type.icon
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setMode(type.id)}
                        className={`p-3 border rounded-md text-center transition-colors ${
                          mode === type.id
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mx-auto mb-1 ${
                          mode === type.id ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                        <div className="text-sm font-medium">{type.name}</div>
                        <div className="text-xs text-gray-500">{type.description}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {mode === 'tier' && (
                <div className="space-y-2">
                  <label htmlFor="x-label" className="text-sm font-medium">Categories (optional)</label>
                  <Input
                    id="x-label"
                    value={xLabel}
                    onChange={(e) => setXLabel(e.target.value)}
                    placeholder="e.g., Programming Languages"
                  />
                </div>
              )}

              {mode === 'single_axis' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Axis Labels</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Low end</label>
                      <Input
                        value={xLowLabel}
                        onChange={(e) => setXLowLabel(e.target.value)}
                        placeholder="e.g., Easy"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">High end</label>
                      <Input
                        value={xHighLabel}
                        onChange={(e) => setXHighLabel(e.target.value)}
                        placeholder="e.g., Difficult"
                      />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'two_axis' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">X-Axis Labels</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={xLowLabel}
                        onChange={(e) => setXLowLabel(e.target.value)}
                        placeholder="Left (e.g., Hard to Learn)"
                      />
                      <Input
                        value={xHighLabel}
                        onChange={(e) => setXHighLabel(e.target.value)}
                        placeholder="Right (e.g., Easy to Learn)"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Y-Axis Labels</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={yLowLabel}
                        onChange={(e) => setYLowLabel(e.target.value)}
                        placeholder="Bottom (e.g., Low Demand)"
                      />
                      <Input
                        value={yHighLabel}
                        onChange={(e) => setYHighLabel(e.target.value)}
                        placeholder="Top (e.g., High Demand)"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="items" className="text-sm font-medium">
                  Items (one per line, optionally with image URLs)
                </label>
                <Textarea
                  id="items"
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  placeholder="JavaScript&#10;Python https://example.com/python-logo.png&#10;Rust&#10;Go&#10;TypeScript"
                  className="min-h-[120px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Format: "Item Name" or "Item Name https://image-url.com/image.png"
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="voting-period" className="text-sm font-medium">
                  Voting Period (Optional)
                </label>
                <Select value={votingPeriod} onValueChange={setVotingPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="No time limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No time limit</SelectItem>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">1 week</SelectItem>
                    <SelectItem value="14">2 weeks</SelectItem>
                    <SelectItem value="30">1 month</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Set a deadline for voting. After this time, no new votes can be submitted.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Chart'}
              </Button>
          </form>

          {showLinks && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-900 mb-3">Chart Created Successfully!</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-green-700 mb-2">Share this link for voting:</p>
                  <div className="flex gap-2">
                    <input 
                      readOnly 
                      value={chartLinks.shareUrl}
                      className="flex-1 text-xs p-2 bg-white border rounded"
                    />
                    <Button 
                      size="sm" 
                      onClick={() => {
                        const [path, search] = chartLinks.shareUrl.split('?')
                        navigate(`${path}?${search}`)
                      }}
                    >
                      Vote Now
                    </Button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-green-700 mb-2">Admin link (save this!):</p>
                  <div className="flex gap-2">
                    <input 
                      readOnly 
                      value={chartLinks.adminUrl}
                      className="flex-1 text-xs p-2 bg-white border rounded"
                    />
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        const [path, search] = chartLinks.adminUrl.split('?')
                        navigate(`${path}?${search}`)
                      }}
                    >
                      View Results
                    </Button>
                  </div>
                </div>
                
                <Button 
                  className="w-full mt-4" 
                  variant="outline"
                  onClick={() => {
                    setShowLinks(false)
                    setTitle('')
                    setCurrentSuggestion(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)])
                    setXLabel('')
                    setXLowLabel('')
                    setXHighLabel('')
                    setYLowLabel('')
                    setYHighLabel('')
                    setItems('')
                    setVotingPeriod('none')
                  }}
                >
                  Create Another Chart
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}