import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trophy, Plus } from "lucide-react"

interface LeaderboardEntry {
  rotation: string
  submissions: number
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[]
}

interface ResidentLeaderboardEntry {
  resident_name: string
  submissions: number
}

interface ResidentLeaderboardData {
  leaderboard: ResidentLeaderboardEntry[]
}

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [residentData, setResidentData] = useState<ResidentLeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('week')
  const [activeTab, setActiveTab] = useState<'teams' | 'residents'>('teams')

  useEffect(() => {
    async function fetchLeaderboards() {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
        
        // Fetch team leaderboard
        const teamResponse = await fetch(`${API_BASE}/api/leaderboard?range=${timeRange}`)
        if (!teamResponse.ok) {
          throw new Error("Failed to fetch team leaderboard")
        }
        const teamResult = await teamResponse.json()
        setData(teamResult)
        
        // Fetch resident leaderboard
        const residentResponse = await fetch(`${API_BASE}/api/leaderboard/residents`)
        if (!residentResponse.ok) {
          throw new Error("Failed to fetch resident leaderboard")
        }
        const residentResult = await residentResponse.json()
        setResidentData(residentResult)
        
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboards()
  }, [timeRange])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading leaderboard...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-red-500">Error: {error}</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data || (!data.leaderboard.length && (!residentData || !residentData.leaderboard.length))) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Submissions {timeRange === 'all' ? 'all time' : `this ${timeRange}`}</h1>
          
          <div className="flex justify-center gap-1">
            {(['week', 'month', 'all'] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="text-xs capitalize"
              >
                {range}
              </Button>
            ))}
          </div>
          
          <Card>
            <CardContent className="text-center py-12">
              <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No submissions yet {timeRange === 'all' ? 'ever' : `this ${timeRange}`}</h2>
              <p className="text-muted-foreground mb-6">Be the first to contribute!</p>
              <Button asChild>
                <Link to="/submit">
                  <Plus className="h-4 w-4 mr-1" />
                  Submit now
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const currentData = activeTab === 'teams' ? data?.leaderboard : residentData?.leaderboard
  const maxSubmissions = currentData?.[0]?.submissions || 1

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Submissions {timeRange === 'all' ? 'all time' : `this ${timeRange}`}</h1>
        
        {/* Combined Navigation Row */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex gap-1">
            {(['week', 'month', 'all'] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="text-xs capitalize"
              >
                {range === 'all' ? 'all time' : range}
              </Button>
            ))}
          </div>
          
          {/* Team/Resident Toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={activeTab === 'teams' ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab('teams')}
              className="text-sm"
            >
              Teams
            </Button>
            <Button
              variant={activeTab === 'residents' ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab('residents')}
              className="text-sm"
            >
              Residents
            </Button>
          </div>
        </div>
        
        {/* Total Submissions Counter */}
        {(data?.leaderboard || residentData?.leaderboard) && (
          <p className="text-sm text-muted-foreground">
            {activeTab === 'teams' 
              ? `${data?.leaderboard.reduce((sum, team) => sum + team.submissions, 0) || 0} total submissions across all teams`
              : `${residentData?.leaderboard.reduce((sum, resident) => sum + resident.submissions, 0) || 0} total submissions from ${residentData?.leaderboard.length || 0} residents`
            }
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4" />
              <span>{activeTab === 'teams' ? 'Team rankings' : 'Resident rankings'}</span>
            </div>
            <Link to="/info" className="text-xs text-muted-foreground hover:text-foreground">
              How scores work?
            </Link>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {currentData?.map((entry, index) => (
            <div key={activeTab === 'teams' ? (entry as LeaderboardEntry).rotation : (entry as ResidentLeaderboardEntry).resident_name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <Badge 
                  variant={index === 0 ? "default" : "secondary"}
                  className={`min-w-[2rem] justify-center ${
                    index === 0 ? "bg-yellow-500 hover:bg-yellow-600" : ""
                  }`}
                >
                  #{index + 1}
                </Badge>
                
                <div>
                  <h3 className="font-medium">
                    {activeTab === 'teams' 
                      ? (entry as LeaderboardEntry).rotation 
                      : (entry as ResidentLeaderboardEntry).resident_name
                    }
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {entry.submissions} submission{entry.submissions !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-lg font-semibold">{entry.submissions}</div>
                </div>
                
                <div className="w-20 bg-muted rounded-full h-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      index === 0 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ 
                      width: `${Math.max(8, (entry.submissions / maxSubmissions) * 100)}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          )) || []}
        </CardContent>
      </Card>

      <div className="text-center space-y-2">
        <div className="flex gap-2 justify-center">
          <Button size="sm" asChild>
            <Link to="/submit">
              <Plus className="h-4 w-4 mr-1" />
              Submit now
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/results">
              <Trophy className="h-4 w-4 mr-1" />
              All Submissions
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}