import { useState, useCallback, useEffect } from 'react'
import { X, Plus, Sparkles, Loader2 } from 'lucide-react'
import SimpleImagePicker from './SimpleImagePicker'

interface Item {
  id: string
  text: string
  imageUrl?: string
}

interface ItemData {
  label: string
  image_url?: string
}

interface RichItemsEditorProps {
  value: ItemData[]
  onChange: (value: ItemData[]) => void
  onGenerateSuggestions?: () => Promise<string[]>
  placeholder?: string
  chartTitle?: string
  chartDescription?: string
  autoPickImages?: boolean
}

export default function RichItemsEditor({ 
  value, 
  onChange, 
  onGenerateSuggestions,
  chartTitle,
  chartDescription,
  autoPickImages = false
}: RichItemsEditorProps) {
  const [items, setItems] = useState<Item[]>([])
  const [newItemText, setNewItemText] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [imagePickerQuery, setImagePickerQuery] = useState('')
  const [autoPickingImages, setAutoPickingImages] = useState<Set<string>>(new Set())

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

  // Initialize items from value prop only once
  useEffect(() => {
    console.log('[RichItemsEditor] useEffect triggered - value:', value, 'items:', items)
    // Only initialize if items is empty and value has data
    // This prevents the parent value from overwriting local edits
    if (items.length === 0 && value.length > 0) {
      console.log('[RichItemsEditor] Initializing items from value prop')
      const parsedItems = value.map((item, index) => ({
        id: `item-${Date.now()}-${index}`,
        text: item.label,
        imageUrl: item.image_url
      }))
      console.log('[RichItemsEditor] Setting initial items:', parsedItems)
      setItems(parsedItems)
    }
  }, []) // Empty dependency - only run on mount

  // Track items state changes for debugging
  useEffect(() => {
    console.log('[RichItemsEditor] Items state changed to:', items)
  }, [items])

  // Convert items array back to structured format and update both local and parent state
  const updateValue = useCallback((updatedItems: Item[]) => {
    console.log('[RichItemsEditor] updateValue called with:', updatedItems)
    setItems(updatedItems) // Update local state
    const structuredItems = updatedItems.map(item => ({
      label: item.text,
      image_url: item.imageUrl
    }))
    console.log('[RichItemsEditor] Calling onChange with:', structuredItems)
    onChange(structuredItems) // Update parent
  }, [onChange])

  // Update item image
  const updateItemImage = useCallback((id: string, imageUrl: string) => {
    const updatedItems = items.map(item =>
      item.id === id ? { ...item, imageUrl } : item
    )
    updateValue(updatedItems)
    setSelectedItemId(null)
  }, [items, updateValue])

  // Auto-pick image for an item
  const autoPickImage = useCallback(async (itemId: string, itemLabel: string) => {
    if (!autoPickImages) return
    
    setAutoPickingImages(prev => new Set([...prev, itemId]))
    
    try {
      const response = await fetch(`${API_BASE}/api/images/auto-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_label: itemLabel,
          chart_title: chartTitle || '',
          chart_description: chartDescription || ''
        })
      })
      
      if (response.ok) {
        const { image_url } = await response.json()
        if (image_url) {
          // Update only the image for this specific item
          const currentItems = items.map(item =>
            item.id === itemId ? { ...item, imageUrl: image_url } : item
          )
          updateValue(currentItems)
        }
      }
    } catch (error) {
      console.error('Auto-pick image error:', error)
    } finally {
      setAutoPickingImages(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }, [autoPickImages, chartTitle, chartDescription, API_BASE, items, updateValue])

  // Bulk auto-pick images for multiple items
  const bulkAutoPickImages = useCallback(async (itemsToProcess: Item[]) => {
    if (!autoPickImages || itemsToProcess.length === 0) return
    
    console.log('[RichItemsEditor] bulkAutoPickImages called with:', itemsToProcess)
    
    // Mark all items as loading
    const itemIds = itemsToProcess.map(item => item.id)
    setAutoPickingImages(prev => new Set([...prev, ...itemIds]))
    
    try {
      const response = await fetch(`${API_BASE}/api/images/bulk-auto-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToProcess.map(item => ({
            id: item.id,
            label: item.text
          })),
          chart_title: chartTitle || '',
          chart_description: chartDescription || ''
        })
      })
      
      if (response.ok) {
        const { results } = await response.json()
        console.log('[RichItemsEditor] Got bulk image results:', results)
        
        // Use the functional update pattern to get the current items
        setItems(currentItems => {
          console.log('[RichItemsEditor] Current items at image update time:', currentItems)
          
          const updatedItems = [...currentItems]
          results.forEach((result: { id: string; image_url: string }) => {
            const index = updatedItems.findIndex(item => item.id === result.id)
            console.log('[RichItemsEditor] Processing result:', result, 'found index:', index)
            if (index !== -1 && result.image_url) {
              updatedItems[index] = { ...updatedItems[index], imageUrl: result.image_url }
              console.log('[RichItemsEditor] Updated item at index', index, ':', updatedItems[index])
            }
          })
          
          console.log('[RichItemsEditor] Final items with images:', updatedItems)
          
          // Also update parent with the new items
          const structuredItems = updatedItems.map(item => ({
            label: item.text,
            image_url: item.imageUrl
          }))
          console.log('[RichItemsEditor] Calling onChange from bulk pick with:', structuredItems)
          onChange(structuredItems)
          
          return updatedItems
        })
      } else {
        console.error('[RichItemsEditor] Bulk image pick failed:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('[RichItemsEditor] Bulk auto-pick images error:', error)
    } finally {
      setAutoPickingImages(prev => {
        const newSet = new Set(prev)
        itemIds.forEach(id => newSet.delete(id))
        return newSet
      })
      console.log('[RichItemsEditor] Bulk image picking completed')
    }
  }, [autoPickImages, chartTitle, chartDescription, API_BASE, onChange])

  // Add a new item
  const addItem = useCallback(() => {
    if (!newItemText.trim()) return
    
    const newItem: Item = {
      id: `item-${Date.now()}`,
      text: newItemText.trim(),
      imageUrl: undefined
    }
    
    const updatedItems = [...items, newItem]
    updateValue(updatedItems)
    
    // Auto-pick image if enabled
    if (autoPickImages) {
      autoPickImage(newItem.id, newItem.text)
    }
    
    setNewItemText('')
  }, [items, newItemText, updateValue, autoPickImages, autoPickImage])

  // Remove an item
  const removeItem = useCallback((id: string) => {
    const updatedItems = items.filter(item => item.id !== id)
    updateValue(updatedItems)
  }, [items, updateValue])

  // Update item text
  const updateItemText = useCallback((id: string, text: string) => {
    const updatedItems = items.map(item =>
      item.id === id ? { ...item, text } : item
    )
    updateValue(updatedItems)
  }, [items, updateValue])


  // Generate AI suggestions
  const handleGenerateSuggestions = useCallback(async () => {
    if (!onGenerateSuggestions) return
    
    console.log('[RichItemsEditor] Starting AI suggestions generation')
    console.log('[RichItemsEditor] Current items before generation:', items)
    
    setGeneratingSuggestions(true)
    try {
      const suggestions = await onGenerateSuggestions()
      console.log('[RichItemsEditor] Got suggestions from AI:', suggestions)
      
      const newItems = suggestions.map((text, index) => ({
        id: `item-${Date.now()}-${index}`,
        text,
        imageUrl: undefined
      }))
      console.log('[RichItemsEditor] Created new items:', newItems)
      
      const updatedItems = [...items, ...newItems]
      console.log('[RichItemsEditor] Combined items (current + new):', updatedItems)
      
      updateValue(updatedItems) // Updates both local and parent state
      
      // Use bulk image picking for all generated items at once
      if (autoPickImages && newItems.length > 0) {
        console.log('[RichItemsEditor] Auto-picking images enabled, starting bulk pick in 100ms')
        // Use setTimeout to let the state settle first
        setTimeout(() => {
          console.log('[RichItemsEditor] Starting bulk image picking for:', newItems)
          bulkAutoPickImages(newItems)
        }, 100)
      }
    } catch (error) {
      console.error('[RichItemsEditor] Error generating suggestions:', error)
    } finally {
      setGeneratingSuggestions(false)
      console.log('[RichItemsEditor] AI suggestions generation completed')
    }
  }, [items, onGenerateSuggestions, updateValue, autoPickImages, bulkAutoPickImages])

  return (
    <div className="space-y-4">
      {/* Items List */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div 
            key={item.id} 
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg transition-all duration-300 hover:bg-gray-100 hover:shadow-sm animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* 48px Avatar or Add Image pill */}
            {autoPickingImages.has(item.id) ? (
              <div className="w-12 h-12 bg-gray-200 rounded border flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              </div>
            ) : item.imageUrl ? (
              <div className="relative">
                <img 
                  src={item.imageUrl} 
                  alt={item.text}
                  className="w-12 h-12 object-cover rounded border"
                />
                <div className="absolute -top-1 -right-1 flex gap-1">
                  <button
                    onClick={() => {
                      setSelectedItemId(item.id)
                      setImagePickerQuery(item.text)
                      setShowImagePicker(true)
                    }}
                    className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-blue-700"
                    title="Replace image"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => updateItemImage(item.id, '')}
                    className="w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-700"
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setSelectedItemId(item.id)
                  setImagePickerQuery(item.text)
                  setShowImagePicker(true)
                }}
                className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full hover:bg-blue-200 transition-colors flex items-center gap-1"
              >
                🖼 Add image
              </button>
            )}
            
            {/* Item text */}
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateItemText(item.id, e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-300"
            />
            
            {/* Remove button */}
            <button
              onClick={() => removeItem(item.id)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addItem()}
          placeholder="Add a new item..."
          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addItem}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* AI Suggestions button */}
      {onGenerateSuggestions && (
        <button
          onClick={handleGenerateSuggestions}
          disabled={generatingSuggestions}
          className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generatingSuggestions ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generate AI Suggestions
        </button>
      )}

      {/* Simple Image Picker */}
      <SimpleImagePicker 
        isOpen={showImagePicker}
        onClose={() => {
          setShowImagePicker(false)
          setSelectedItemId(null)
        }}
        onSelect={(imageUrl) => {
          if (selectedItemId) {
            updateItemImage(selectedItemId, imageUrl)
          }
        }}
        searchQuery={imagePickerQuery}
      />

      {/* Item count */}
      <div className="text-xs text-gray-500">
        {items.length} items added
      </div>
    </div>
  )
}