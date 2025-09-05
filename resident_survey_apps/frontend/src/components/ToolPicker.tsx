import { useState, useMemo } from "react"
import { Search, Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ToolPickerProps {
  tools: string[]
  selectedTool: string | null
  onSelect: (tool: string) => void
  placeholder?: string
  error?: string
}

export default function ToolPicker({ 
  tools, 
  selectedTool, 
  onSelect, 
  placeholder = "Select tool...",
  error 
}: ToolPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredTools = useMemo(() => {
    if (!searchQuery) return tools
    return tools.filter(tool => 
      tool.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tools, searchQuery])

  const handleSelect = (tool: string) => {
    onSelect(tool)
    setIsOpen(false)
    setSearchQuery("")
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className={`w-full justify-start ${selectedTool ? 'text-foreground' : 'text-muted-foreground'} ${error ? 'border-red-500' : ''}`}
      >
        <Wrench className="h-4 w-4 mr-2" />
        {selectedTool || placeholder}
      </Button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {isOpen && (
        <Card className="absolute z-50 w-full max-w-sm mt-1">
          <CardContent className="p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoFocus
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredTools.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No tools found
                </p>
              ) : (
                filteredTools.map((tool) => (
                  <button
                    key={tool}
                    onClick={() => handleSelect(tool)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded-md transition-colors"
                  >
                    {tool}
                  </button>
                ))
              )}
            </div>
            
            <div className="flex justify-between items-center mt-3 pt-2 border-t">
              <Badge variant="secondary" className="text-xs">
                {filteredTools.length} found
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