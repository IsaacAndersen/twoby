import React, { useState, useCallback } from 'react'
import { X, Search, Link, Upload, Loader2 } from 'lucide-react'

interface ImagePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (imageUrl: string) => void
  searchQuery: string
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

export default function SimpleImagePicker({ isOpen, onClose, onSelect, searchQuery }: ImagePickerProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'url' | 'upload'>('search')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  // Auto-search on open
  React.useEffect(() => {
    if (isOpen && searchQuery && activeTab === 'search') {
      handleSearch(searchQuery)
    }
  }, [isOpen, searchQuery])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return
    
    setIsSearching(true)
    try {
      const response = await fetch(`${API_BASE}/api/images/search?q=${encodeURIComponent(query + ' logo')}`)
      
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.results || [])
        setSelectedImageIndex(0) // Auto-select first result
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleUse = () => {
    if (activeTab === 'search' && searchResults[selectedImageIndex]) {
      onSelect(searchResults[selectedImageIndex].full)
    } else if (activeTab === 'url' && urlInput.trim()) {
      onSelect(urlInput.trim())
    }
    onClose()
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        onSelect(dataUrl)
        onClose()
      }
      reader.readAsDataURL(file)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Choose an image</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'search' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Search className="w-4 h-4 inline mr-1" />
            Search
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'url' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Link className="w-4 h-4 inline mr-1" />
            Paste URL
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'upload' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1" />
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {activeTab === 'search' && (
            <div className="space-y-3">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-gray-500">Searching...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {searchResults.slice(0, 6).map((image, index) => (
                    <div
                      key={image.id}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`cursor-pointer rounded border-2 transition-all ${
                        selectedImageIndex === index 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img
                        src={image.thumbnail}
                        alt={image.description}
                        className="w-full h-20 object-cover rounded"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No images found. Try a different search term.
                </div>
              )}
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-3">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {urlInput && (
                <div className="border rounded p-2">
                  <img 
                    src={urlInput} 
                    alt="Preview" 
                    className="w-full h-32 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/200x100/f3f4f6/9ca3af?text=Invalid+URL`
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
              <label className="block">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <div className="text-sm text-gray-600">
                    Click to upload an image
                    <br />
                    <span className="text-xs text-gray-400">PNG, JPG, GIF up to 10MB</span>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleUse}
            disabled={
              (activeTab === 'search' && !searchResults[selectedImageIndex]) ||
              (activeTab === 'url' && !urlInput.trim())
            }
            className="px-6 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use
          </button>
        </div>
      </div>
    </div>
  )
}