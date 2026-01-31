import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Grid2x2, Shuffle } from 'lucide-react'
import RichItemsEditor from './RichItemsEditor'
import { createShortUrl } from '@/utils/urlShortening'

interface ItemData {
  label: string
  image_url?: string
}

// Title suggestions for inspiration
const TITLE_SUGGESTIONS = [
  'Programming Languages',
  'Movies',
  'Pizza Toppings',
  'Video Games',
  'Music Genres',
  'Travel Destinations',
  'TV Shows',
  'Coffee Shops',
  'Books',
  'Board Games',
  'Productivity Tools',
  'Desserts',
  'Fast Food Chains',
  'Comfort Foods',
]

export default function CreateChart() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [currentSuggestion, setCurrentSuggestion] = useState('')
  const [xLowLabel, setXLowLabel] = useState('')
  const [xHighLabel, setXHighLabel] = useState('')
  const [yLowLabel, setYLowLabel] = useState('')
  const [yHighLabel, setYHighLabel] = useState('')
  const [items, setItems] = useState<ItemData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [chartLinks, setChartLinks] = useState({ shareUrl: '', adminUrl: '' })
  const [errors, setErrors] = useState<{title?: string, items?: string, general?: string}>({})
  const isSubmittingRef = useRef(false)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Prevent multiple submissions
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
      newErrors.items = `Please add at least 2 items (you have ${items.length})`
    } else if (items.length > 50) {
      newErrors.items = `Too many items. Please limit to 50 or fewer (you have ${items.length})`
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      isSubmittingRef.current = false
      return
    }

    setIsLoading(true)
    try {
      // Create chart (always 2x2 mode)
      const chartResponse = await fetch(`${API_BASE}/api/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          mode: 'two_axis',
          x_label: `${xLowLabel.trim() || 'Low'} → ${xHighLabel.trim() || 'High'}`,
          y_label: `${yLowLabel.trim() || 'Low'} → ${yHighLabel.trim() || 'High'}`,
          visibility: 'public'
        })
      })

      if (!chartResponse.ok) throw new Error('Failed to create chart')
      const chart = await chartResponse.json()

      // Add items
      const adminKey = new URL(chart.admin_url, window.location.origin).searchParams.get('k')
      const itemList = items.filter(item => item.label.trim()).map(item => ({
        label: item.label.trim(),
        image_url: item.image_url || undefined
      }))

      const itemsResponse = await fetch(`${API_BASE}/api/charts/${chart.id}/items?k=${adminKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemList })
      })

      if (!itemsResponse.ok) throw new Error('Failed to add items')

      // Show links
      setChartLinks({ shareUrl: chart.share_url, adminUrl: chart.admin_url })
      setShowLinks(true)
      isSubmittingRef.current = false

    } catch (error: any) {
      console.error('Error:', error)
      setErrors({ general: 'Failed to create chart. Please try again.' })
    } finally {
      setIsLoading(false)
      isSubmittingRef.current = false
    }
  }

  const resetForm = () => {
    setShowLinks(false)
    setTitle('')
    setDescription('')
    setCurrentSuggestion(TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)])
    setXLowLabel('')
    setXHighLabel('')
    setYLowLabel('')
    setYHighLabel('')
    setItems([])
    isSubmittingRef.current = false
    setIsLoading(false)
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-xl">
      <div className="mb-6">
        <Link to="/">
          <Button variant="ghost" className="p-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Grid2x2 className="w-5 h-5 text-blue-600" />
            <CardTitle>Create 2×2 Chart</CardTitle>
          </div>
          <CardDescription>
            Create a chart where people vote on where items belong on two axes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showLinks ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  What are you comparing?
                </label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    if (errors.title) setErrors(prev => ({ ...prev, title: undefined }))
                  }}
                  placeholder="e.g. Video Games"
                  className={errors.title ? 'border-red-500' : ''}
                />
                {errors.title && (
                  <p className="text-sm text-red-600">{errors.title}</p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTitle(currentSuggestion)
                    getNewSuggestion()
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 h-7 px-2"
                >
                  <Shuffle className="w-3 h-3 mr-1" />
                  Try: "{currentSuggestion}"
                </Button>
              </div>

              {/* Axes */}
              <div className="space-y-4">
                <label className="text-sm font-medium">Axes (optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X-Axis Left</label>
                    <Input
                      value={xLowLabel}
                      onChange={(e) => setXLowLabel(e.target.value)}
                      placeholder="Easy"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X-Axis Right</label>
                    <Input
                      value={xHighLabel}
                      onChange={(e) => setXHighLabel(e.target.value)}
                      placeholder="Hard"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y-Axis Bottom</label>
                    <Input
                      value={yLowLabel}
                      onChange={(e) => setYLowLabel(e.target.value)}
                      placeholder="Boring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y-Axis Top</label>
                    <Input
                      value={yHighLabel}
                      onChange={(e) => setYHighLabel(e.target.value)}
                      placeholder="Fun"
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Items to compare
                </label>
                <RichItemsEditor
                  value={items}
                  onChange={(value) => {
                    setItems(value)
                    if (errors.items) setErrors(prev => ({ ...prev, items: undefined }))
                  }}
                  placeholder="Type an item and press Enter..."
                />
                {errors.items && (
                  <p className="text-sm text-red-600">{errors.items}</p>
                )}
              </div>

              {/* Description (collapsed by default) */}
              <details className="group">
                <summary className="text-sm font-medium cursor-pointer text-gray-600 hover:text-gray-900">
                  + Add description (optional)
                </summary>
                <div className="mt-2">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add context for voters..."
                    className="min-h-[60px] text-sm"
                    maxLength={280}
                  />
                </div>
              </details>

              {errors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{errors.general}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Chart'
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🎉</div>
                <h3 className="font-semibold text-lg">Chart Created!</h3>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium mb-1">Share this link for voting:</div>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-white p-2 rounded border truncate">
                      {window.location.origin + chartLinks.shareUrl}
                    </code>
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
                          btn.textContent = '✓'
                          setTimeout(() => btn.textContent = 'Copy', 1500)
                        } catch {
                          navigator.clipboard.writeText(window.location.origin + chartLinks.shareUrl)
                          const btn = e.currentTarget
                          btn.textContent = '✓'
                          setTimeout(() => btn.textContent = 'Copy', 1500)
                        }
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const [path, search] = chartLinks.shareUrl.split('?')
                      navigate(`${path}?${search}`)
                    }}
                  >
                    Start Voting
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const [path, search] = chartLinks.adminUrl.split('?')
                      navigate(`${path}?${search}`)
                    }}
                  >
                    View Results
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={resetForm}
                >
                  Create Another
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
