import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Shuffle } from 'lucide-react'
import RichItemsEditor from './RichItemsEditor'
import { createShortUrl } from '@/utils/urlShortening'
import { API_BASE } from '@/config'
import type { ItemData } from '@/types'

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

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === 'AbortError'
}

function getLocalFallbackSuggestions(title: string): string[] {
  const t = title.toLowerCase()
  if (t.includes('fortnite') && (t.includes('location') || t.includes('poi'))) {
    return ['Tilted Towers', 'Retail Row', 'Pleasant Park', 'Greasy Grove', 'Loot Lake', 'Mega City']
  }
  if (t.includes('movie') || t.includes('film')) {
    return ['Inception', 'The Dark Knight', 'Parasite', 'The Matrix', 'Pulp Fiction', 'Interstellar']
  }
  if (t.includes('tv') || t.includes('show')) {
    return ['Breaking Bad', 'Succession', 'The Office', 'The Wire', 'Severance', 'The Bear']
  }
  if (t.includes('game')) {
    return ['Minecraft', 'Fortnite', 'Elden Ring', 'Zelda', 'Valorant', 'Stardew Valley']
  }
  if (t.includes('park')) {
    return ['Yosemite', 'Yellowstone', 'Zion', 'Acadia', 'Grand Canyon', 'Glacier']
  }
  if (t.includes('food') || t.includes('pizza') || t.includes('coffee')) {
    return ['Pizza', 'Tacos', 'Burgers', 'Sushi', 'Pasta', 'BBQ']
  }
  return []
}

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
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([])
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [chartLinks, setChartLinks] = useState({ shareUrl: '', adminUrl: '' })
  const [errors, setErrors] = useState<{title?: string, items?: string, general?: string}>({})
  const isSubmittingRef = useRef(false)
  const lastGoodSuggestionsRef = useRef<string[]>([])

  const normalizedTitle = useMemo(() => title.trim(), [title])

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

  function addSuggestedItems(labels: string[]) {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.label.trim().toLowerCase()).filter(Boolean))
      const next = [...prev]
      for (const label of labels) {
        const clean = label.trim()
        if (!clean) continue
        const key = clean.toLowerCase()
        if (existing.has(key)) continue
        next.push({ label: clean })
        existing.add(key)
      }
      return next
    })
  }

  useEffect(() => {
    if (!normalizedTitle || normalizedTitle.length < 2) {
      setItemSuggestions([])
      return
    }

    const fallback = getLocalFallbackSuggestions(normalizedTitle)
    if (fallback.length > 0) {
      setItemSuggestions(fallback)
    } else if (lastGoodSuggestionsRef.current.length > 0) {
      setItemSuggestions(lastGoodSuggestionsRef.current)
    }

    const controller = new AbortController()
    const handle = setTimeout(async () => {
      setIsSuggesting(true)
      try {
        const itemsRes = await fetch(`${API_BASE}/api/ai/suggest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: normalizedTitle, mode: 'two_axis', type: 'items' }),
          signal: controller.signal,
        })

        if (itemsRes.ok) {
          const data: unknown = await itemsRes.json()
          const rawItems = (data as { items?: unknown })?.items
          const nextItems: string[] = Array.isArray(rawItems)
            ? rawItems
                .map((s) => (typeof s === 'string' ? s.trim() : ''))
                .filter(Boolean)
            : []

          const seen = new Set<string>()
          const deduped: string[] = []
          for (const item of nextItems) {
            const key = item.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            deduped.push(item)
          }
          if (deduped.length > 0) {
            const limited = deduped.slice(0, 18)
            setItemSuggestions(limited)
            lastGoodSuggestionsRef.current = limited
          } else if (fallback.length > 0) {
            setItemSuggestions(fallback)
          } else if (lastGoodSuggestionsRef.current.length > 0) {
            setItemSuggestions(lastGoodSuggestionsRef.current)
          }
        } else {
          if (fallback.length > 0) {
            setItemSuggestions(fallback)
          } else if (lastGoodSuggestionsRef.current.length > 0) {
            setItemSuggestions(lastGoodSuggestionsRef.current)
          }
        }
      } catch (error: unknown) {
        if (!isAbortError(error)) {
          console.warn('Suggestion fetch failed:', error)
        }
        if (fallback.length > 0) {
          setItemSuggestions(fallback)
        } else if (lastGoodSuggestionsRef.current.length > 0) {
          setItemSuggestions(lastGoodSuggestionsRef.current)
        }
      } finally {
        setIsSuggesting(false)
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [API_BASE, normalizedTitle])

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

    } catch (error: unknown) {
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
          <CardTitle>New chart</CardTitle>
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
                    <label className="block text-xs text-slate-500 mb-1">X-Axis Left</label>
                    <Input
                      value={xLowLabel}
                      onChange={(e) => setXLowLabel(e.target.value)}
                      placeholder="Easy"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">X-Axis Right</label>
                    <Input
                      value={xHighLabel}
                      onChange={(e) => setXHighLabel(e.target.value)}
                      placeholder="Hard"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Y-Axis Bottom</label>
                    <Input
                      value={yLowLabel}
                      onChange={(e) => setYLowLabel(e.target.value)}
                      placeholder="Boring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Y-Axis Top</label>
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
                  contextQuery={title}
                />

                {/* Item suggestions */}
                {normalizedTitle && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-slate-600">Suggested items</div>
                      <div className="flex items-center gap-2">
                        {itemSuggestions.length > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => addSuggestedItems(itemSuggestions)}
                          >
                            Add all
                          </Button>
                        )}
                        {isSuggesting && <div className="text-xs text-slate-400">Thinking…</div>}
                      </div>
                    </div>
                    {itemSuggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {itemSuggestions.map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => addSuggestedItems([label])}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                          >
                            + {label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">Type a title to get suggestions</div>
                    )}
                  </div>
                )}

                {errors.items && (
                  <p className="text-sm text-red-600">{errors.items}</p>
                )}
              </div>

              {/* Description (collapsed by default) */}
              <details className="group">
                <summary className="text-sm font-medium cursor-pointer text-slate-600 hover:text-slate-900">
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
                <h3 className="font-semibold text-lg">Chart created</h3>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-lg">
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
