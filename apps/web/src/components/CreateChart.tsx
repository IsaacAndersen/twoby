import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ChartBar, BarChart3, Grid2x2, Shuffle } from 'lucide-react'
import RichItemsEditor from './RichItemsEditor'
import { generateItemSuggestions, generateAxisSuggestions, generateChartDescription } from '@/services/openai'
import { createShortUrl, getDisplayUrl } from '@/utils/urlShortening'
import { Sparkles, Loader2 } from 'lucide-react'
import Snackbar from './Snackbar'

type ChartMode = 'tier' | 'single_axis' | 'two_axis'

interface ItemData {
  label: string
  image_url?: string
}

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
  const [description, setDescription] = useState('')
  const [creatorTake, setCreatorTake] = useState('')
  const [currentSuggestion, setCurrentSuggestion] = useState('')
  const [mode, setMode] = useState<ChartMode>('tier')
  const [xLabel, setXLabel] = useState('')
  const [xLowLabel, setXLowLabel] = useState('')
  const [xHighLabel, setXHighLabel] = useState('')
  const [yLowLabel, setYLowLabel] = useState('')
  const [yHighLabel, setYHighLabel] = useState('')
  const [xAxisLabel, setXAxisLabel] = useState('') // Simple axis label
  const [yAxisLabel, setYAxisLabel] = useState('') // Simple axis label
  const [generatingXAxis, setGeneratingXAxis] = useState(false)
  const [generatingYAxis, setGeneratingYAxis] = useState(false)
  const [items, setItems] = useState<ItemData[]>([])
  const [votingPeriod, setVotingPeriod] = useState<string>('none')
  const [isLoading, setIsLoading] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [chartLinks, setChartLinks] = useState({ shareUrl: '', adminUrl: '' })
  const [errors, setErrors] = useState<{title?: string, items?: string, general?: string}>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [generatingAxes, setGeneratingAxes] = useState(false)
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [showImageNudge, setShowImageNudge] = useState(false)
  const [toolName, setToolName] = useState('OpenEvidence')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskImageUrl, setTaskImageUrl] = useState('')
  const [uploadImages, setUploadImages] = useState('')
  const isSubmittingRef = useRef(false)

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  // Function to generate axis endpoints from simple labels
  const generateAxisEndpoints = async (axisLabel: string, isXAxis: boolean) => {
    if (!axisLabel.trim()) return

    const setGenerating = isXAxis ? setGeneratingXAxis : setGeneratingYAxis
    setGenerating(true)
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/generate-axis-endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          axis_label: axisLabel,
          context: title 
        })
      })
      
      if (response.ok) {
        const { low, high } = await response.json()
        if (isXAxis) {
          setXLowLabel(low)
          setXHighLabel(high)
        } else {
          setYLowLabel(low)
          setYHighLabel(high)
        }
      }
    } catch (error) {
      console.error('Failed to generate axis endpoints:', error)
    } finally {
      setGenerating(false)
    }
  }

  // Initialize with a random suggestion but don't pre-populate
  useEffect(() => {
    setCurrentSuggestion(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)])
  }, [])

  // Auto-suggest axes when switching to 2x2 mode with existing content
  useEffect(() => {
    if (mode === 'two_axis' && title && items.length >= 2 && !xAxisLabel && !yAxisLabel && !xLowLabel && !xHighLabel && !yLowLabel && !yHighLabel && !generatingAxes) {
      // Auto-suggest axes after a short delay to let the UI settle
      const timer = setTimeout(async () => {
        setGeneratingAxes(true)
        try {
          const { xAxis, yAxis } = await generateAxisSuggestions(
            title,
            items.filter(item => item.label.trim()).map(item => item.label)
          )
          if (xAxis && yAxis) {
            const xParts = xAxis.split('→').map(s => s.trim())
            const yParts = yAxis.split('→').map(s => s.trim())
            
            if (xParts.length === 2) {
              setXLowLabel(xParts[0])
              setXHighLabel(xParts[1])
              setXAxisLabel('') // Keep simple axis label empty for auto-generated
            }
            
            if (yParts.length === 2) {
              setYLowLabel(yParts[0])
              setYHighLabel(yParts[1])
              setYAxisLabel('') // Keep simple axis label empty for auto-generated
            }
          }
        } catch (error) {
          console.error('Auto-axis generation failed:', error)
        } finally {
          setGeneratingAxes(false)
        }
      }, 500)
      
      return () => clearTimeout(timer)
    }
  }, [mode, title, items, xAxisLabel, yAxisLabel, xLowLabel, xHighLabel, yLowLabel, yHighLabel, generatingAxes])

  // Handle graceful parsing of existing arrow format in simple axis labels
  useEffect(() => {
    if (xAxisLabel.includes('→') || xAxisLabel.includes('->')) {
      const separator = xAxisLabel.includes('→') ? '→' : '->'
      const parts = xAxisLabel.split(separator).map(s => s.trim())
      if (parts.length === 2) {
        setXLowLabel(parts[0])
        setXHighLabel(parts[1])
        setXAxisLabel('') // Clear the input after parsing
      }
    }
  }, [xAxisLabel])

  useEffect(() => {
    if (yAxisLabel.includes('→') || yAxisLabel.includes('->')) {
      const separator = yAxisLabel.includes('→') ? '→' : '->'
      const parts = yAxisLabel.split(separator).map(s => s.trim())
      if (parts.length === 2) {
        setYLowLabel(parts[0])
        setYHighLabel(parts[1])
        setYAxisLabel('') // Clear the input after parsing
      }
    }
  }, [yAxisLabel])

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
    
    // Prevent multiple submissions with both state and ref guard
    if (isLoading || isSubmittingRef.current) return
    isSubmittingRef.current = true
    
    // Clear previous errors
    setErrors({})
    
    // Validate inputs
    const newErrors: {title?: string, items?: string, general?: string} = {}
    
    if (!title.trim()) {
      newErrors.title = 'Please enter a chart title'
    }
    
    if (items.length < 2) {
      newErrors.items = `Please enter at least 2 items to rank (you have ${items.length})`
    } else if (items.length > 50) {
      newErrors.items = `Too many items. Please limit to 50 or fewer (you have ${items.length})`
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Content filtering
    const filteredTitle = filterContent(title.trim())
    const filteredItems = items.map(item => ({
      ...item,
      label: filterContent(item.label.trim())
    }))

    // Show warning if content was filtered
    const originalItemsText = items.map(item => item.label).join('\n')
    const filteredItemsText = filteredItems.map(item => item.label).join('\n')
    if (filteredTitle !== title.trim() || filteredItemsText !== originalItemsText) {
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
          description: description.trim(),
          creator_take: creatorTake.trim(),
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
          voting_period_days: votingPeriod && votingPeriod !== 'none' ? parseInt(votingPeriod) : null,
          task_description: taskDescription.trim(),
          task_image_url: taskImageUrl.trim(),
          tool_name: toolName,
          upload_images: uploadImages.trim()
        })
      })

      if (!chartResponse.ok) throw new Error('Failed to create chart')
      const chart = await chartResponse.json()

      // Add items
      const adminKey = new URL(chart.admin_url, window.location.origin).searchParams.get('k')
      const itemList = filteredItems.filter(item => item.label.trim()).map(item => ({
        label: item.label.trim(),
        image_url: item.image_url || undefined
      }))

      const itemsResponse = await fetch(`${API_BASE}/api/charts/${chart.id}/items?k=${adminKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemList })
      })

      if (!itemsResponse.ok) throw new Error('Failed to add items')

      // Show links and navigation options
      setChartLinks({ shareUrl: chart.share_url, adminUrl: chart.admin_url })
      setShowLinks(true)
      
      // Show image nudge if no items have images
      const hasImages = itemList.some(item => item.image_url)
      if (!hasImages) {
        setTimeout(() => setShowImageNudge(true), 2000) // Show after 2 seconds
      }
      
      // Reset submission guard on success
      isSubmittingRef.current = false

    } catch (error: any) {
      console.error('Error:', error)
      
      // Provide more specific error messages based on the error
      let errorMessage = 'Failed to create chart. Please try again.'
      
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.'
      } else if (error.message?.includes('validation')) {
        errorMessage = 'Please check your input and try again.'
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.'
      }
      
      setErrors({ general: errorMessage })
    } finally {
      setIsLoading(false)
      isSubmittingRef.current = false
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
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    if (errors.title) setErrors(prev => ({ ...prev, title: undefined }))
                  }}
                  placeholder="Enter your chart title..."
                  required
                  className={errors.title ? 'border-red-500' : ''}
                />
                {errors.title && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                    {errors.title}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTitle(currentSuggestion)
                    getNewSuggestion()
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 h-6 px-2"
                >
                  <Shuffle className="w-3 h-3 mr-1" />
                  Try: "{currentSuggestion}"
                </Button>
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
                        onClick={() => {
                          setMode(type.id)
                          // Reset labels when switching modes
                          setXLabel('')
                          setXLowLabel('')
                          setXHighLabel('')
                          setYLowLabel('')
                          setYHighLabel('')
                          setXAxisLabel('')
                          setYAxisLabel('')
                        }}
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


              {mode === 'single_axis' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Axis Labels <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Low end</label>
                      <Input
                        value={xLowLabel}
                        onChange={(e) => setXLowLabel(e.target.value)}
                        placeholder="Easy"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">High end</label>
                      <Input
                        value={xHighLabel}
                        onChange={(e) => setXHighLabel(e.target.value)}
                        placeholder="Difficult"
                      />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'two_axis' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Axis Labels <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!title || !items) {
                          alert('Please add a title and some items first')
                          return
                        }
                        setGeneratingAxes(true)
                        try {
                          const { xAxis, yAxis } = await generateAxisSuggestions(
                            title,
                            items.filter(item => item.label.trim()).map(item => item.label)
                          )
                          if (xAxis && yAxis) {
                            // Parse the axis format "Low → High"
                            const xParts = xAxis.split('→').map(s => s.trim())
                            const yParts = yAxis.split('→').map(s => s.trim())
                            
                            if (xParts.length === 2) {
                              setXLowLabel(xParts[0])
                              setXHighLabel(xParts[1])
                            } else {
                              setXLowLabel('Low ' + xAxis)
                              setXHighLabel('High ' + xAxis)
                            }
                            
                            if (yParts.length === 2) {
                              setYLowLabel(yParts[0])
                              setYHighLabel(yParts[1])
                            } else {
                              setYLowLabel('Low ' + yAxis)
                              setYHighLabel('High ' + yAxis)
                            }
                          }
                        } catch (error) {
                          console.error('Error generating axes:', error)
                        } finally {
                          setGeneratingAxes(false)
                        }
                      }}
                      disabled={generatingAxes}
                      className="text-xs"
                    >
                      {generatingAxes ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="w-3 h-3 mr-1" /> AI Suggest</>
                      )}
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-600">X-Axis</label>
                      <Input
                        value={xAxisLabel}
                        onChange={(e) => setXAxisLabel(e.target.value)}
                        onBlur={() => generateAxisEndpoints(xAxisLabel, true)}
                        placeholder="Cool"
                        disabled={generatingXAxis}
                      />
                      {generatingXAxis && (
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Generating...
                        </div>
                      )}
                      {!generatingXAxis && xLowLabel && xHighLabel && (
                        <div className="text-xs text-green-600 mt-1">
                          ✓ {xLowLabel} → {xHighLabel}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-600">Y-Axis</label>
                      <Input
                        value={yAxisLabel}
                        onChange={(e) => setYAxisLabel(e.target.value)}
                        onBlur={() => generateAxisEndpoints(yAxisLabel, false)}
                        placeholder="Quality"
                        disabled={generatingYAxis}
                      />
                      {generatingYAxis && (
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Generating...
                        </div>
                      )}
                      {!generatingYAxis && yLowLabel && yHighLabel && (
                        <div className="text-xs text-green-600 mt-1">
                          ✓ {yLowLabel} → {yHighLabel}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="items" className="text-sm font-medium">
                  Items to Compare
                </label>
                <RichItemsEditor
                  value={items}
                  onChange={(value) => {
                    console.log('[CreateChart] RichItemsEditor onChange called with:', value)
                    console.log('[CreateChart] Current items before update:', items)
                    setItems(value)
                    console.log('[CreateChart] setItems called with:', value)
                    if (errors.items) setErrors(prev => ({ ...prev, items: undefined }))
                  }}
                  onGenerateSuggestions={async () => {
                    const suggestions = await generateItemSuggestions({
                      title,
                      description,
                      existingItems: items.filter(item => item.label.trim()).map(item => item.label),
                      xAxis: mode === 'two_axis' ? `${xLowLabel} → ${xHighLabel}` : undefined,
                      yAxis: mode === 'two_axis' ? `${yLowLabel} → ${yHighLabel}` : undefined,
                      mode: mode === 'tier' ? 'ranking' : mode
                    })
                    return suggestions
                  }}
                  chartTitle={title}
                  chartDescription={description}
                  autoPickImages={true}
                  placeholder="Enter items to compare, one per line..."
                />
                {errors.items && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                    {errors.items}
                  </p>
                )}
              </div>

              {/* Advanced Options Toggle */}
              <div className="border-t border-gray-100 pt-6 mt-8">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">Advanced Options</h3>
                  <span className="text-xs text-gray-500 font-normal">
                    {showAdvanced ? 'Hide' : 'Show'}
                  </span>
                </button>
                
                {showAdvanced && (
                  <div className="space-y-6 mt-4">
                    <div className="space-y-2">
                      <label htmlFor="tool-name" className="text-sm font-medium">
                        Which tool will help with this task?
                      </label>
                      <Select value={toolName} onValueChange={setToolName}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OpenEvidence">OpenEvidence</SelectItem>
                          <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                          <SelectItem value="Claude">Claude</SelectItem>
                          <SelectItem value="Perplexity">Perplexity</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="task-description" className="text-sm font-medium">
                        Task Description
                      </label>
                      <Textarea
                        id="task-description"
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Describe the task or research question..."
                        className="min-h-[60px] text-sm"
                        maxLength={1000}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Add context about what you're trying to accomplish</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          📷 Add Image
                        </Button>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-700">
                          ⚠️ <strong>HIPAA Warning:</strong> Do not upload any patient information, medical records, or other protected health information.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="description" className="text-sm font-medium">
                          Description
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!title || !items) {
                              alert('Please add a title and items first')
                              return
                            }
                            setGeneratingDescription(true)
                            try {
                              const desc = await generateChartDescription(
                                title,
                                items.filter(item => item.label.trim()).map(item => item.label)
                              )
                              if (desc) {
                                setDescription(desc)
                              }
                            } catch (error) {
                              console.error('Error generating description:', error)
                            } finally {
                              setGeneratingDescription(false)
                            }
                          }}
                          disabled={generatingDescription}
                          className="text-xs"
                        >
                          {generatingDescription ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
                          ) : (
                            <><Sparkles className="w-3 h-3 mr-1" /> AI Generate</>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add context for voters (optional)"
                        className="min-h-[60px] text-sm"
                        maxLength={280}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="creator-take" className="text-sm font-medium">
                        Your Take
                      </label>
                      <Textarea
                        id="creator-take"
                        value={creatorTake}
                        onChange={(e) => setCreatorTake(e.target.value)}
                        placeholder="Share your prediction (shown after voting)"
                        className="min-h-[60px] text-sm"
                        maxLength={500}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="voting-period" className="text-sm font-medium">
                        Voting Period
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
                    </div>
                  </div>
                )}
              </div>

              {errors.general && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    {errors.general}
                  </p>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                onClick={(e) => {
                  if (isLoading) {
                    e.preventDefault()
                    return
                  }
                  if (errors.general) setErrors(prev => ({ ...prev, general: undefined }))
                }}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creating Chart...
                  </>
                ) : (
                  'Create Chart'
                )}
              </Button>
          </form>

          {showLinks && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-900 mb-4">Chart Created Successfully! 🎉</h3>
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-green-900">Voting Link</div>
                      <div className="text-xs text-green-700 truncate" title={window.location.origin + chartLinks.shareUrl}>
                        {getDisplayUrl(window.location.origin + chartLinks.shareUrl)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={async (e) => {
                          try {
                            const [path, search] = chartLinks.shareUrl.split('?')
                            const params = new URLSearchParams(search)
                            const shortUrl = await createShortUrl(path, params, title)
                            navigator.clipboard.writeText(shortUrl)
                            const btn = e.currentTarget
                            btn.textContent = '✓ Copied'
                            setTimeout(() => btn.textContent = 'Copy', 2000)
                          } catch (error) {
                            console.error('Error creating short URL:', error)
                            navigator.clipboard.writeText(window.location.origin + chartLinks.shareUrl)
                            const btn = e.currentTarget
                            btn.textContent = '✓ Copied'
                            setTimeout(() => btn.textContent = 'Copy', 2000)
                          }
                        }}
                      >
                        Copy
                      </Button>
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
                  
                  <div className="flex items-center justify-between p-3 bg-white rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-green-900">Admin Link</div>
                      <div className="text-xs text-green-700 truncate" title={window.location.origin + chartLinks.adminUrl}>
                        {getDisplayUrl(window.location.origin + chartLinks.adminUrl)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={async (e) => {
                          try {
                            const [path, search] = chartLinks.adminUrl.split('?')
                            const params = new URLSearchParams(search)
                            const shortUrl = await createShortUrl(path, params, title + ' (Admin)')
                            navigator.clipboard.writeText(shortUrl)
                            const btn = e.currentTarget
                            btn.textContent = '✓ Copied'
                            setTimeout(() => btn.textContent = 'Copy', 2000)
                          } catch (error) {
                            console.error('Error creating short URL:', error)
                            navigator.clipboard.writeText(window.location.origin + chartLinks.adminUrl)
                            const btn = e.currentTarget
                            btn.textContent = '✓ Copied'
                            setTimeout(() => btn.textContent = 'Copy', 2000)
                          }
                        }}
                      >
                        Copy
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const [path, search] = chartLinks.adminUrl.split('?')
                          navigate(`${path}?${search}`)
                        }}
                      >
                        Results
                      </Button>
                    </div>
                  </div>
                </div>
                
                <Button 
                  className="w-full mt-4" 
                  variant="outline"
                  onClick={() => {
                    setShowLinks(false)
                    setTitle('')
                    setDescription('')
                    setCreatorTake('')
                    setCurrentSuggestion(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)])
                    setXLabel('')
                    setXLowLabel('')
                    setXHighLabel('')
                    setYLowLabel('')
                    setYHighLabel('')
                    setItems([])
                    setVotingPeriod('none')
                    setXAxisLabel('')
                    setYAxisLabel('')
                    setToolName('OpenEvidence')
                    setTaskDescription('')
                    setTaskImageUrl('')
                    setUploadImages('')
                    isSubmittingRef.current = false
                    setIsLoading(false)
                  }}
                >
                  Create Another Chart
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Image nudge snackbar */}
      {showImageNudge && (
        <Snackbar 
          message="Add images to make this chart pop!"
          action={{
            label: "Pick images",
            onClick: () => {
              // Scroll to the admin link section and focus on items editing
              const adminLink = chartLinks.adminUrl
              if (adminLink) {
                const [path, search] = adminLink.split('?')
                navigate(`${path}?${search}`)
              }
            }
          }}
          onDismiss={() => setShowImageNudge(false)}
        />
      )}
    </div>
  )
}