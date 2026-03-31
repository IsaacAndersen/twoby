import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Home, Trash2, Flame, Star, Users, Clock, Search, Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { API_BASE } from '@/config'

interface AdminChart {
  id: string
  title: string
  mode: string
  item_count: number
  vote_count: number
  created_at: string
  is_hot?: boolean
  is_featured?: boolean
  is_hidden?: boolean
  admin_url?: string
}

const ADMIN_TOKEN_KEY = 'admin_token'

export default function AdminPage() {
  const [charts, setCharts] = useState<AdminChart[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [token, setToken] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    const savedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
    if (savedToken) {
      setToken(savedToken)
      void loadCharts(savedToken)
    } else {
      setIsLoading(false)
    }
  }, [])

  async function loadCharts(authToken: string) {
    setIsLoading(true)
    setAuthError(null)

    try {
      const response = await fetch(`${API_BASE}/api/admin/charts?limit=500&offset=0&mode=two_axis`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.status === 403) {
        setIsAuthenticated(false)
        setAuthError('Invalid admin token')
        sessionStorage.removeItem(ADMIN_TOKEN_KEY)
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to load charts (${response.status})`)
      }

      const data = await response.json()
      const enriched = (data as AdminChart[]).map((chart) => ({
        ...chart,
        admin_url: `/c/${chart.id}?s=public`,
      }))

      setCharts(enriched)
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Failed to load charts:', error)
      setAuthError('Failed to load charts')
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  async function updateChartFlags(chartId: string, patch: { is_hot?: boolean; is_featured?: boolean; is_hidden?: boolean }) {
    if (!token) return
    setAuthError(null)

    // Optimistic update
    setCharts((prev) =>
      prev.map((c) => (c.id === chartId ? { ...c, ...patch } : c)),
    )

    try {
      const response = await fetch(`${API_BASE}/api/admin/charts/${chartId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      })

      if (response.status === 403) {
        setIsAuthenticated(false)
        setAuthError('Invalid admin token')
        sessionStorage.removeItem(ADMIN_TOKEN_KEY)
        return
      }

      if (!response.ok) throw new Error('Failed to update chart')
    } catch (error) {
      console.error('Failed to update chart:', error)
      setAuthError('Failed to update chart')
      // Re-sync
      void loadCharts(token)
    }
  }

  function handleLogin() {
    const trimmed = token.trim()
    if (!trimmed) return
    sessionStorage.setItem(ADMIN_TOKEN_KEY, trimmed)
    void loadCharts(trimmed)
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    setToken('')
    setIsAuthenticated(false)
    setCharts([])
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString.replace('+00:00Z', 'Z'))
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const visibleCharts = useMemo(() => {
    return charts.filter((chart) => showHidden || !chart.is_hidden)
  }, [charts, showHidden])

  const filteredCharts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return visibleCharts
    return visibleCharts.filter((chart) => chart.title.toLowerCase().includes(q) || chart.id.includes(q))
  }, [visibleCharts, searchQuery])

  const stats = useMemo(() => {
    const active = charts.filter((c) => !c.is_hidden)
    return {
      totalCharts: active.length,
      totalVotes: active.reduce((sum, c) => sum + c.vote_count, 0),
      hotCount: active.filter((c) => c.is_hot).length,
      featuredCount: active.filter((c) => c.is_featured).length,
      hiddenCount: charts.filter((c) => c.is_hidden).length,
    }
  }, [charts])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleLogin()
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin token</label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste ADMIN_TOKEN"
                  required
                />
                {authError && <p className="text-sm text-red-600">{authError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Checking…' : 'Login'}
              </Button>
              <div className="text-xs text-gray-500">
                Token is stored in session only.
              </div>
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowHidden((v) => !v)}
                title={showHidden ? 'Hide hidden charts' : 'Show hidden charts'}
              >
                {showHidden ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showHidden ? 'Hide Hidden' : 'Show Hidden'} ({stats.hiddenCount})
              </Button>
              <Link to="/">
                <Button variant="outline">
                  <Home className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <Button variant="outline" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalCharts}</div>
                <p className="text-xs text-muted-foreground">Visible Charts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.totalVotes}</div>
                <p className="text-xs text-muted-foreground">Total Votes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-600">{stats.hotCount}</div>
                <p className="text-xs text-muted-foreground">Hot</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-purple-600">{stats.featuredCount}</div>
                <p className="text-xs text-muted-foreground">Featured</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-600">{stats.hiddenCount}</div>
                <p className="text-xs text-muted-foreground">Hidden</p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or ID…"
              className="pl-10"
            />
          </div>
          {authError && <p className="text-sm text-red-600 mt-3">{authError}</p>}
        </div>

        {/* Charts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Charts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading…</div>
            ) : (
              <div className="space-y-2">
                {filteredCharts.map((chart) => (
                  <div
                    key={chart.id}
                    className={`flex items-center justify-between p-3 rounded-lg border hover:shadow-sm transition-shadow ${
                      chart.is_hidden ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={chart.admin_url || '#'} className="font-medium hover:text-blue-600">
                          {chart.title}
                        </Link>
                        {chart.is_hot && (
                          <Badge className="bg-orange-100 text-orange-700">
                            <Flame className="w-3 h-3 mr-1" />
                            Hot
                          </Badge>
                        )}
                        {chart.is_featured && (
                          <Badge className="bg-purple-100 text-purple-700">
                            <Star className="w-3 h-3 mr-1" />
                            Featured
                          </Badge>
                        )}
                        {chart.is_hidden && (
                          <Badge variant="outline" className="text-gray-600">
                            Hidden
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
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
                        variant={chart.is_hot ? 'default' : 'outline'}
                        onClick={() => updateChartFlags(chart.id, { is_hot: !chart.is_hot })}
                        className={chart.is_hot ? 'bg-orange-500 hover:bg-orange-600' : ''}
                        title="Toggle hot"
                      >
                        <Flame className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={chart.is_featured ? 'default' : 'outline'}
                        onClick={() => updateChartFlags(chart.id, { is_featured: !chart.is_featured })}
                        className={chart.is_featured ? 'bg-purple-500 hover:bg-purple-600' : ''}
                        title="Toggle featured"
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(chart.is_hidden ? 'Restore this chart to the public feed?' : 'Hide this chart from the public feed?')) {
                            updateChartFlags(chart.id, { is_hidden: !chart.is_hidden })
                          }
                        }}
                        className="text-red-600 hover:bg-red-50"
                        title={chart.is_hidden ? 'Restore chart' : 'Hide chart'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {filteredCharts.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-500">No charts found.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

