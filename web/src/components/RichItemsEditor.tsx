import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Plus, Image, Loader2 } from 'lucide-react'

interface Item {
  id: string
  text: string
  image_url?: string
  imageLoading?: boolean
  imageIndex?: number  // Current index in the image options
  imageOptions?: string[]  // All available image URLs for cycling
}

interface ItemData {
  label: string
  image_url?: string
}

interface RichItemsEditorProps {
  value: ItemData[]
  onChange: (value: ItemData[]) => void
  placeholder?: string
  enableImages?: boolean
  contextQuery?: string  // Optional context to prepend to image searches (e.g., chart title)
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://twoby-production.up.railway.app'

export default function RichItemsEditor({
  value,
  onChange,
  placeholder = "Add an item...",
  enableImages = true,
  contextQuery = ""
}: RichItemsEditorProps) {
  const [items, setItems] = useState<Item[]>([])
  const [newItemText, setNewItemText] = useState('')
  const imageCache = useRef<Record<string, string[]>>({})  // Cache stores arrays of image URLs

  // Initialize items from value prop only once on mount
  useEffect(() => {
    if (items.length === 0 && value.length > 0) {
      const parsedItems = value.map((item, index) => ({
        id: `item-${Date.now()}-${index}`,
        text: item.label,
        image_url: item.image_url
      }))
      setItems(parsedItems)
    }
  }, [])

  // Update parent when items change
  const updateParent = useCallback((updatedItems: Item[]) => {
    const structuredItems = updatedItems.map(item => ({
      label: item.text,
      image_url: item.image_url
    }))
    onChange(structuredItems)
  }, [onChange])

  // Fetch image for an item
  const fetchImageForItem = useCallback(async (itemId: string, query: string) => {
    if (!enableImages || !query.trim()) return

    // Build search query with context (e.g., "Better Call Saul TV Shows" instead of just "Better Call Saul")
    const searchQuery = contextQuery.trim()
      ? `${query.trim()} ${contextQuery.trim()}`
      : query.trim()

    // Check cache first (use the full search query as cache key)
    const cacheKey = searchQuery.toLowerCase()
    if (imageCache.current[cacheKey] && imageCache.current[cacheKey].length > 0) {
      const cachedImages = imageCache.current[cacheKey]
      setItems(prev => {
        const updated = prev.map(item =>
          item.id === itemId ? {
            ...item,
            image_url: cachedImages[0],
            imageOptions: cachedImages,
            imageIndex: 0,
            imageLoading: false
          } : item
        )
        updateParent(updated)
        return updated
      })
      return
    }

    // Mark as loading
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, imageLoading: true } : item
    ))

    try {
      const response = await fetch(`${API_BASE}/api/images/search?q=${encodeURIComponent(searchQuery)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.results && data.results.length > 0) {
          // Store all image URLs (prefer thumbnails for faster loading)
          const imageUrls = data.results
            .map((r: any) => r.thumbnail || r.url)
            .filter((url: string) => url)

          if (imageUrls.length > 0) {
            imageCache.current[cacheKey] = imageUrls

            setItems(prev => {
              const updated = prev.map(item =>
                item.id === itemId ? {
                  ...item,
                  image_url: imageUrls[0],
                  imageOptions: imageUrls,
                  imageIndex: 0,
                  imageLoading: false
                } : item
              )
              updateParent(updated)
              return updated
            })
            return
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch image:', error)
    }

    // Clear loading state on failure
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, imageLoading: false } : item
    ))
  }, [enableImages, updateParent, contextQuery])

  // Add a new item
  const addItem = useCallback(() => {
    if (!newItemText.trim()) return

    const newItem: Item = {
      id: `item-${Date.now()}`,
      text: newItemText.trim()
    }

    const updatedItems = [...items, newItem]
    setItems(updatedItems)
    updateParent(updatedItems)
    setNewItemText('')

    // Auto-fetch image in background
    if (enableImages) {
      fetchImageForItem(newItem.id, newItem.text)
    }
  }, [items, newItemText, updateParent, enableImages, fetchImageForItem])

  // Remove an item
  const removeItem = useCallback((id: string) => {
    const updatedItems = items.filter(item => item.id !== id)
    setItems(updatedItems)
    updateParent(updatedItems)
  }, [items, updateParent])

  // Update item text
  const updateItemText = useCallback((id: string, text: string) => {
    const updatedItems = items.map(item =>
      item.id === id ? { ...item, text } : item
    )
    setItems(updatedItems)
    updateParent(updatedItems)
  }, [items, updateParent])

  // Cycle to next image option
  const cycleImage = useCallback((id: string) => {
    const item = items.find(i => i.id === id)
    if (!item?.imageOptions || item.imageOptions.length <= 1) return

    const currentIndex = item.imageIndex || 0
    const nextIndex = (currentIndex + 1) % item.imageOptions.length
    const nextUrl = item.imageOptions[nextIndex]

    const updatedItems = items.map(i =>
      i.id === id ? { ...i, image_url: nextUrl, imageIndex: nextIndex } : i
    )
    setItems(updatedItems)
    updateParent(updatedItems)
  }, [items, updateParent])

  // Clear image for an item
  const clearImage = useCallback((id: string) => {
    const updatedItems = items.map(item =>
      item.id === id ? { ...item, image_url: undefined, imageOptions: undefined, imageIndex: undefined } : item
    )
    setItems(updatedItems)
    updateParent(updatedItems)
  }, [items, updateParent])

  // Retry fetching image
  const retryImage = useCallback((id: string, text: string) => {
    fetchImageForItem(id, text)
  }, [fetchImageForItem])

  // Handle Enter key - prevent form submission
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addItem()
    }
  }, [addItem])

  return (
    <div className="space-y-3">
      {/* Add new item input - at the top for easier access */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!newItemText.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Items List */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group"
            >
              {/* Image thumbnail */}
              {enableImages && (
                <div className="relative w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-gray-200 flex items-center justify-center group/img">
                  {item.imageLoading ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  ) : item.image_url ? (
                    <>
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => cycleImage(item.id)}
                        title={item.imageOptions && item.imageOptions.length > 1
                          ? `Click to cycle (${(item.imageIndex || 0) + 1}/${item.imageOptions.length})`
                          : "Click to cycle images"
                        }
                      />
                      {/* Image count indicator */}
                      {item.imageOptions && item.imageOptions.length > 1 && (
                        <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] px-1 rounded-tl">
                          {(item.imageIndex || 0) + 1}/{item.imageOptions.length}
                        </div>
                      )}
                      {/* Clear button on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearImage(item.id)
                        }}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"
                        title="Remove image"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => retryImage(item.id, item.text)}
                      className="w-full h-full flex items-center justify-center hover:bg-gray-300 transition-colors"
                      title="Click to fetch image"
                    >
                      <Image className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
              )}

              <input
                type="text"
                value={item.text}
                onChange={(e) => updateItemText(item.id, e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Item count */}
      <div className="text-xs text-gray-500">
        {items.length} item{items.length !== 1 ? 's' : ''} added
        {items.length < 2 && <span className="text-amber-600 ml-1">(minimum 2 required)</span>}
      </div>
    </div>
  )
}
