import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Image as ImageIcon, Search, X, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ImagePickerProps {
  itemName: string
  currentUrl?: string
  onImageSelect: (url: string | null) => void
}

interface LogoSuggestion {
  domain: string
  logo: string
  name: string
}

export default function ImagePicker({ itemName, currentUrl, onImageSelect }: ImagePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(itemName)
  const [customUrl, setCustomUrl] = useState(currentUrl || '')
  const [logoSuggestions, setLogoSuggestions] = useState<LogoSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(currentUrl || '')
  const [previewError, setPreviewError] = useState(false)

  // Common logo databases (using Clearbit as primary)
  const searchLogos = async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    setLogoSuggestions([])
    
    try {
      // Try to find company logos using various strategies
      const suggestions: LogoSuggestion[] = []
      
      // Strategy 1: Direct company domain search
      const domainQuery = searchQuery.toLowerCase().replace(/\s+/g, '')
      const possibleDomains = [
        `${domainQuery}.com`,
        `${domainQuery}.io`,
        `${domainQuery}.co`,
        `${domainQuery}.app`,
        `get${domainQuery}.com`,
        `${domainQuery}app.com`,
      ]
      
      for (const domain of possibleDomains.slice(0, 3)) {
        suggestions.push({
          domain,
          logo: `https://logo.clearbit.com/${domain}`,
          name: domain
        })
      }
      
      // Strategy 2: Common brand logos (hardcoded popular brands)
      const brandMappings: { [key: string]: string } = {
        'spotify': 'spotify.com',
        'apple': 'apple.com',
        'google': 'google.com',
        'microsoft': 'microsoft.com',
        'amazon': 'amazon.com',
        'netflix': 'netflix.com',
        'discord': 'discord.com',
        'slack': 'slack.com',
        'notion': 'notion.so',
        'figma': 'figma.com',
        'github': 'github.com',
        'twitter': 'twitter.com',
        'x': 'x.com',
        'facebook': 'facebook.com',
        'instagram': 'instagram.com',
        'youtube': 'youtube.com',
        'reddit': 'reddit.com',
        'linkedin': 'linkedin.com',
        'openai': 'openai.com',
        'anthropic': 'anthropic.com',
      }
      
      const searchLower = searchQuery.toLowerCase()
      for (const [brand, domain] of Object.entries(brandMappings)) {
        if (searchLower.includes(brand) || brand.includes(searchLower)) {
          suggestions.push({
            domain,
            logo: `https://logo.clearbit.com/${domain}`,
            name: brand.charAt(0).toUpperCase() + brand.slice(1)
          })
        }
      }
      
      // Remove duplicates
      const uniqueSuggestions = suggestions.filter((item, index, self) =>
        index === self.findIndex((t) => t.domain === item.domain)
      ).slice(0, 6)
      
      setLogoSuggestions(uniqueSuggestions)
      
    } catch (error) {
      console.error('Logo search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectLogo = (url: string) => {
    setSelectedUrl(url)
    setCustomUrl(url)
    setPreviewError(false)
  }

  const handleApply = () => {
    if (selectedUrl || customUrl) {
      onImageSelect(customUrl || selectedUrl)
      setIsOpen(false)
    }
  }

  const handleRemove = () => {
    onImageSelect(null)
    setSelectedUrl('')
    setCustomUrl('')
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          type="button" 
          variant="outline" 
          size="sm"
          className="h-7 text-xs"
        >
          {currentUrl ? (
            <>
              <ImageIcon className="w-3 h-3 mr-1" />
              Change Image
            </>
          ) : (
            <>
              <ImageIcon className="w-3 h-3 mr-1" />
              Add Image
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Image for {itemName}</DialogTitle>
          <DialogDescription>
            Search for a logo or enter a custom image URL
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Logo Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search for Logo</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Spotify, Discord, Apple..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    searchLogos()
                  }
                }}
              />
              <Button 
                type="button"
                onClick={searchLogos}
                disabled={isSearching}
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
            
            {logoSuggestions.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {logoSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectLogo(suggestion.logo)}
                    className={`p-3 border rounded-md hover:bg-gray-50 transition-colors flex flex-col items-center gap-2 ${
                      selectedUrl === suggestion.logo ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <img 
                      src={suggestion.logo} 
                      alt={suggestion.name}
                      className="w-12 h-12 object-contain"
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0iI0U1RTdFQiIvPgo8cGF0aCBkPSJNMjggMThIMjBDMTguODk1NCAxOCAxOCAxOC44OTU0IDE4IDIwVjI4QzE4IDI5LjEwNDYgMTguODk1NCAzMCAyMCAzMEgyOEMyOS4xMDQ2IDMwIDMwIDI5LjEwNDYgMzAgMjhWMjBDMzAgMTguODk1NCAyOS4xMDQ2IDE4IDI4IDE4WiIgc3Ryb2tlPSIjOUIyQzJDIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4='
                      }}
                    />
                    <span className="text-xs text-gray-600 truncate max-w-full">
                      {suggestion.name}
                    </span>
                    {selectedUrl === suggestion.logo && (
                      <Check className="w-3 h-3 text-blue-600 absolute top-1 right-1" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          {/* Custom URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Custom Image URL</label>
            <Input
              type="url"
              placeholder="https://example.com/image.png"
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value)
                setSelectedUrl('')
                setPreviewError(false)
              }}
            />
          </div>

          {/* Preview */}
          {(selectedUrl || customUrl) && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview</label>
              <Card className="p-4 flex items-center justify-center h-24 bg-gray-50">
                {!previewError ? (
                  <img 
                    src={customUrl || selectedUrl} 
                    alt="Preview"
                    className="max-h-16 max-w-full object-contain"
                    onError={() => setPreviewError(true)}
                  />
                ) : (
                  <div className="text-sm text-gray-500">
                    Unable to load image
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            {currentUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemove}
                className="text-red-600 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-1" />
                Remove Image
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleApply}
                disabled={!selectedUrl && !customUrl}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}