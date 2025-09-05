import { useState, useEffect, useMemo } from "react"
import { Search, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getAuthHeaders } from "@/lib/auth"

interface ResidentPickerProps {
  selectedResident: string | null
  onSelect: (resident: string | null) => void
}

export default function ResidentPicker({ selectedResident, onSelect }: ResidentPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [residents, setResidents] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchResidents() {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
        const response = await fetch(`${API_BASE}/api/residents`, {
          headers: getAuthHeaders()
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('Residents API response:', data) // Debug log
        setResidents(data.residents || [])
      } catch (error) {
        console.error("Failed to fetch residents:", error)
        console.error("Error details:", error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }
    }

    fetchResidents()
  }, [])

  const filteredResidents = useMemo(() => {
    if (!searchQuery) return residents
    return residents.filter(resident => 
      resident.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [residents, searchQuery])

  const handleSelect = (resident: string) => {
    onSelect(resident)
    setIsOpen(false)
    setSearchQuery("")
    
    // Save to cookie
    document.cookie = `resident_name=${encodeURIComponent(resident)}; path=/; max-age=${7 * 24 * 60 * 60}` // 7 days
  }

  const handleClear = () => {
    onSelect(null)
    // Clear cookie
    document.cookie = `resident_name=; path=/; max-age=0`
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Resident (optional)</label>
        <div className="flex h-10 w-full rounded-md border border-input bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Resident</label>
      
      {selectedResident ? (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-blue-50 border-blue-200">
          <User className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-900 flex-1">
            {selectedResident}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-100"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="w-full justify-start text-muted-foreground"
        >
          <User className="h-4 w-4 mr-2" />
          Select resident...
        </Button>
      )}

      {isOpen && (
        <Card className="absolute z-50 w-full max-w-sm mt-1">
          <CardContent className="p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search residents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoFocus
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredResidents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No residents found
                </p>
              ) : (
                filteredResidents.map((resident) => (
                  <button
                    key={resident}
                    onClick={() => handleSelect(resident)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded-md transition-colors"
                  >
                    {resident}
                  </button>
                ))
              )}
            </div>
            
            <div className="flex justify-between items-center mt-3 pt-2 border-t">
              <Badge variant="secondary" className="text-xs">
                {filteredResidents.length} found
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}