import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sparkles, Loader2, ChevronRight, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface AISuggestionsProps {
  title: string
  mode: 'tier' | 'single_axis' | 'two_axis'
  onAddItems: (items: string[]) => void
  onSetAxes?: (axes: { xLow?: string; xHigh?: string; yLow?: string; yHigh?: string }) => void
}

export default function AISuggestions({ title, mode, onAddItems, onSetAxes }: AISuggestionsProps) {
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [isLoadingAxes, setIsLoadingAxes] = useState(false)
  const [suggestedItems, setSuggestedItems] = useState<string[]>([])
  const [suggestedAxes, setSuggestedAxes] = useState<any[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showFeature, setShowFeature] = useState(false) // Hide AI suggestions by default
  
  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  async function getSuggestions() {
    if (!title.trim()) return
    
    setIsLoadingItems(true)
    try {
      const response = await fetch(`${API_BASE}/api/ai/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title,
          mode,
          type: 'items'
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        // Check if we got meaningful suggestions (not placeholder data)
        const items = data.items || []
        const hasRealSuggestions = items.length > 0 && !items.some((item: string) => 
          item.startsWith('Option') || item.match(/^[ABC]\d*$/) || item === 'Item A' || item === 'Item B'
        )
        
        if (hasRealSuggestions) {
          setSuggestedItems(items)
          setSelectedItems(new Set(items))
        } else {
          // Show a message that AI suggestions aren't ready yet
          alert('AI suggestions are still in development. Try adding items manually for now.')
        }
      }
    } catch (error) {
      console.error('Failed to get AI suggestions:', error)
      alert('AI suggestions are temporarily unavailable. Try adding items manually.')
    } finally {
      setIsLoadingItems(false)
    }
  }

  async function getAxisSuggestions() {
    if (!title.trim() || mode === 'tier') return
    
    setIsLoadingAxes(true)
    try {
      const response = await fetch(`${API_BASE}/api/ai/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title,
          mode,
          type: 'axes'
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setSuggestedAxes(data.axes || [])
      }
    } catch (error) {
      console.error('Failed to get axis suggestions:', error)
    } finally {
      setIsLoadingAxes(false)
    }
  }

  function toggleItem(item: string) {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(item)) {
      newSelected.delete(item)
    } else {
      newSelected.add(item)
    }
    setSelectedItems(newSelected)
  }

  function addSelectedItems() {
    if (selectedItems.size > 0) {
      onAddItems(Array.from(selectedItems))
      setSuggestedItems([])
      setSelectedItems(new Set())
    }
  }

  if (!showFeature) {
    return (
      <div className="text-center py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowFeature(true)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Try AI suggestions (beta)
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={getSuggestions}
            disabled={!title.trim() || isLoadingItems}
          >
            {isLoadingItems ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            Suggest Items
            <Badge variant="secondary" className="ml-1 text-xs">beta</Badge>
          </Button>

          {mode !== 'tier' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={getAxisSuggestions}
              disabled={!title.trim() || isLoadingAxes}
            >
              {isLoadingAxes ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              Suggest Axes
              <Badge variant="secondary" className="ml-1 text-xs">beta</Badge>
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowFeature(false)
            setSuggestedItems([])
            setSuggestedAxes([])
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Hide
        </Button>
      </div>

      {suggestedItems.length > 0 && (
        <Card className="p-3 bg-blue-50/50 border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-blue-900">
              AI Suggestions - Click to select/deselect
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addSelectedItems}
              disabled={selectedItems.size === 0}
              className="h-6 text-xs text-blue-700 hover:bg-blue-100"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add {selectedItems.size} selected
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedItems.map((item, idx) => (
              <Badge
                key={idx}
                variant={selectedItems.has(item) ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  selectedItems.has(item) 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' 
                    : 'hover:bg-blue-100 text-blue-700 border-blue-300'
                }`}
                onClick={() => toggleItem(item)}
              >
                {item}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {suggestedAxes.length > 0 && (
        <Card className="p-3 bg-purple-50/50 border-purple-200">
          <p className="text-xs font-medium text-purple-900 mb-2">
            Suggested Axis Labels
          </p>
          <div className="space-y-2">
            {suggestedAxes.map((axis, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSetAxes?.(axis)}
                className="w-full text-left p-2 rounded-md bg-white hover:bg-purple-100 transition-colors border border-purple-200 group"
              >
                {mode === 'single_axis' ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-700">{axis.xLow}</span>
                    <ChevronRight className="w-3 h-3 text-purple-400" />
                    <span className="text-purple-700">{axis.xHigh}</span>
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-600">X:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-purple-700">{axis.xLow}</span>
                        <ChevronRight className="w-3 h-3 text-purple-400" />
                        <span className="text-purple-700">{axis.xHigh}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-purple-600">Y:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-purple-700">{axis.yLow}</span>
                        <ChevronRight className="w-3 h-3 text-purple-400" />
                        <span className="text-purple-700">{axis.yHigh}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-xs text-purple-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to use these labels
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {!title.trim() && (
        <p className="text-xs text-muted-foreground italic">
          Enter a chart title to get AI suggestions
        </p>
      )}
    </div>
  )
}