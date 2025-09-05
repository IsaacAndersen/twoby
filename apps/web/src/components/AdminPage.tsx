import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Home, Trash2, Flame, Star, Users, Clock, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ChartData {
  id: string
  title: string
  mode: string
  item_count: number
  vote_count: number
  created_at: string
  is_hot?: boolean
  is_featured?: boolean
  admin_url?: string
}

export default function AdminPage() {
  const [charts, setCharts] = useState<ChartData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hotCharts, setHotCharts] = useState<Set<string>>(new Set())
  const [featuredCharts, setFeaturedCharts] = useState<Set<string>>(new Set())
  const [deletedCharts, setDeletedCharts] = useState<Set<string>>(new Set())
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'
  
  // Simple password check (you can enhance this later)
  const ADMIN_PASSWORD = 'twoby_admin_2024' // Change this to something secure

  useEffect(() => {
    // Check if already authenticated
    const savedAuth = sessionStorage.getItem('admin_auth')
    if (savedAuth === 'true') {
      setIsAuthenticated(true)
      loadCharts()
    }
  }, [])

  useEffect(() => {
    // Load saved hot/featured charts from localStorage
    const savedHot = localStorage.getItem('admin_hot_charts')
    const savedFeatured = localStorage.getItem('admin_featured_charts')
    if (savedHot) setHotCharts(new Set(JSON.parse(savedHot)))
    if (savedFeatured) setFeaturedCharts(new Set(JSON.parse(savedFeatured)))
  }, [])

  async function loadCharts() {
    try {
      const response = await fetch(`${API_BASE}/api/charts/public`)
      if (response.ok) {
        const data = await response.json()
        
        // Load deleted charts from localStorage
        const savedDeleted = localStorage.getItem('admin_deleted_charts')
        const deletedSet = savedDeleted ? new Set<string>(JSON.parse(savedDeleted)) : new Set<string>()
        setDeletedCharts(deletedSet)
        
        // Filter out deleted charts and enhance with admin metadata
        const filteredData = data
          .filter((chart: ChartData) => !deletedSet.has(chart.id))
          .map((chart: ChartData) => ({
            ...chart,
            admin_url: `/c/${chart.id}?s=public` // Construct admin URL
          }))
        
        setCharts(filteredData)
      }
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleLogin() {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      sessionStorage.setItem('admin_auth', 'true')
      loadCharts()
    } else {
      alert('Invalid password')
    }
  }

  function toggleHot(chartId: string) {
    const newHotCharts = new Set(hotCharts)
    if (newHotCharts.has(chartId)) {
      newHotCharts.delete(chartId)
    } else {
      newHotCharts.add(chartId)
    }
    setHotCharts(newHotCharts)
    localStorage.setItem('admin_hot_charts', JSON.stringify(Array.from(newHotCharts)))
  }

  function toggleFeatured(chartId: string) {
    const newFeaturedCharts = new Set(featuredCharts)
    if (newFeaturedCharts.has(chartId)) {
      newFeaturedCharts.delete(chartId)
    } else {
      newFeaturedCharts.add(chartId)
    }
    setFeaturedCharts(newFeaturedCharts)
    localStorage.setItem('admin_featured_charts', JSON.stringify(Array.from(newFeaturedCharts)))
  }

  function deleteChart(chartId: string) {
    if (confirm('Are you sure you want to hide this chart? It can be restored later.')) {
      const newDeletedCharts = new Set(deletedCharts)
      newDeletedCharts.add(chartId)
      setDeletedCharts(newDeletedCharts)
      localStorage.setItem('admin_deleted_charts', JSON.stringify(Array.from(newDeletedCharts)))
      
      // Remove from displayed charts
      setCharts(charts.filter(c => c.id !== chartId))
    }
  }

  function restoreChart(chartId: string) {
    const newDeletedCharts = new Set(deletedCharts)
    newDeletedCharts.delete(chartId)
    setDeletedCharts(newDeletedCharts)
    localStorage.setItem('admin_deleted_charts', JSON.stringify(Array.from(newDeletedCharts)))
    
    // Reload charts
    loadCharts()
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString.replace('+00:00Z', 'Z'))
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const filteredCharts = charts.filter(chart => 
    chart.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chart.id.includes(searchQuery)
  )

  // Calculate stats
  const totalVotes = charts.reduce((sum, chart) => sum + chart.vote_count, 0)
  const totalCharts = charts.length
  const hotCount = hotCharts.size
  const featuredCount = featuredCharts.size

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">twoby Admin</h1>
            <Link to="/">
              <Button variant="outline">
                <Home className="w-4 h-4 mr-2" />
                Back to Site
              </Button>
            </Link>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalCharts}</div>
                <p className="text-xs text-muted-foreground">Total Charts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalVotes}</div>
                <p className="text-xs text-muted-foreground">Total Votes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-600">{hotCount}</div>
                <p className="text-xs text-muted-foreground">Hot Charts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-purple-600">{featuredCount}</div>
                <p className="text-xs text-muted-foreground">Featured</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or ID..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Charts Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Public Charts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="space-y-2">
                {filteredCharts.map(chart => (
                  <div key={chart.id} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={chart.admin_url || '#'} className="font-medium hover:text-blue-600">
                          {chart.title}
                        </Link>
                        {hotCharts.has(chart.id) && (
                          <Badge className="bg-orange-100 text-orange-700">
                            <Flame className="w-3 h-3 mr-1" />
                            Hot
                          </Badge>
                        )}
                        {featuredCharts.has(chart.id) && (
                          <Badge className="bg-purple-100 text-purple-700">
                            <Star className="w-3 h-3 mr-1" />
                            Featured
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>ID: {chart.id}</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {chart.vote_count} votes
                        </span>
                        <span>{chart.item_count} items</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(chart.created_at)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={hotCharts.has(chart.id) ? "default" : "outline"}
                        onClick={() => toggleHot(chart.id)}
                        className={hotCharts.has(chart.id) ? "bg-orange-500 hover:bg-orange-600" : ""}
                      >
                        <Flame className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={featuredCharts.has(chart.id) ? "default" : "outline"}
                        onClick={() => toggleFeatured(chart.id)}
                        className={featuredCharts.has(chart.id) ? "bg-purple-500 hover:bg-purple-600" : ""}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteChart(chart.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Deleted Charts Section */}
            {deletedCharts.size > 0 && (
              <div className="mt-8 pt-8 border-t">
                <h3 className="font-medium mb-4 text-gray-600">Hidden Charts ({deletedCharts.size})</h3>
                <div className="space-y-2">
                  {Array.from(deletedCharts).map(chartId => (
                    <div key={chartId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-500">Chart ID: {chartId}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreChart(chartId)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}