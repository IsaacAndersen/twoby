import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, BarChart3, Clock, TrendingUp, Activity, Download, Table, Eye, ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getAuthHeaders, getCookie } from "@/lib/auth"

interface ResultsData {
  counts: {
    total_submissions: number
    unique_rotations: number
    today_count: number
    week_count: number
    month_count: number
  }
  usage_by_task: Array<{
    task: string
    n: number
    avg_helpfulness: number
  }>
  tool_effectiveness: Array<{
    tool: string
    n: number
    avg_helpfulness: number
    verify_often_rate: number
  }>
  time_saved_dist: Array<{
    time_saved: string
    n: number
  }>
  verify_conf_dist: Array<{
    verify_conf: string
    n: number
  }>
  recent_activity: Array<{
    date: string
    n: number
  }>
}

interface LikeEntry {
  emoji: string
  user_name: string
  created_at: string
}

interface CommentEntry {
  id: string
  user_name: string
  comment: string
  created_at: string
}

interface RawSubmissionEntry {
  id: string
  created_at: string
  resident_name: string | null
  rotation: string
  used_ai: boolean
  task: string
  tool: string
  tool_other: string | null
  helpfulness: number | null
  task_description: string | null
  time_saved: string | null
  verify_conf: string
  notes: string | null
  task_image: string | null
  likes: LikeEntry[]
  comments: CommentEntry[]
}

interface RawSubmissionsData {
  submissions: RawSubmissionEntry[]
  total_count: number
}

export default function ResultsDashboard() {
  const [data, setData] = useState<ResultsData | null>(null)
  const [rawData, setRawData] = useState<RawSubmissionsData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'submissions'>('submissions')
  const [isDownloading, setIsDownloading] = useState<boolean>(false)
  const [selectedSubmission, setSelectedSubmission] = useState<RawSubmissionEntry | null>(null)
  const [selectedSubmissionIndex, setSelectedSubmissionIndex] = useState<number>(-1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  useEffect(() => {
    // Auto-load data when component mounts since user is authenticated
    loadData()
    
    // Try to get resident name from cookie
    const residentName = getCookie('resident_name')
    if (residentName) {
      setCommentAuthor(decodeURIComponent(residentName))
    }
  }, [])

  async function loadData(skipLoadingState = false) {
    if (!skipLoadingState) {
      setLoading(true)
    }
    setError(null)

    try {
      const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
      const response = await fetch(`${API_BASE}/api/results`, {
        headers: getAuthHeaders()
      })

      if (response.status === 401) {
        setError("Authentication failed. Please refresh the page.")
        if (!skipLoadingState) {
          setLoading(false)
        }
        return null
      }

      if (!response.ok) {
        throw new Error("Failed to fetch results")
      }

      const results = await response.json()
      setData(results)
      
      // Also fetch raw submissions
      const rawResponse = await fetch(`${API_BASE}/api/results/submissions?limit=100`, {
        headers: getAuthHeaders()
      })
      
      if (rawResponse.ok) {
        const rawResults = await rawResponse.json()
        console.log('Raw submissions loaded:', rawResults.submissions?.length || 0)
        setRawData(rawResults)
        return rawResults
      }
      
      return null
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    } finally {
      if (!skipLoadingState) {
        setLoading(false)
      }
    }
  }

  const handleLike = async (emoji: string, userName: string) => {
    if (!selectedSubmission) return
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
      const response = await fetch(`${API_BASE}/api/submissions/${selectedSubmission.id}/like`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          submission_id: selectedSubmission.id,
          emoji,
          user_name: userName
        })
      })
      
      if (response.ok) {
        // Refresh the data to get updated likes without showing loading state
        const freshData = await loadData(true)
        // Update the selected submission with fresh data
        if (freshData?.submissions) {
          const updatedSubmission = freshData.submissions.find((s: RawSubmissionEntry) => s.id === selectedSubmission.id)
          if (updatedSubmission) {
            setSelectedSubmission(updatedSubmission)
          }
        }
      }
    } catch (error) {
      console.error('Failed to toggle like:', error)
    }
  }
  
  const handleComment = async () => {
    if (!selectedSubmission || !newComment.trim() || !commentAuthor.trim()) return
    
    setIsSubmittingComment(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
      const response = await fetch(`${API_BASE}/api/submissions/${selectedSubmission.id}/comment`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          submission_id: selectedSubmission.id,
          comment: newComment.trim(),
          user_name: commentAuthor.trim()
        })
      })
      
      if (response.ok) {
        setNewComment('')
        // Refresh the data to get updated comments without showing loading state
        const freshData = await loadData(true)
        // Update the selected submission with fresh data
        if (freshData?.submissions) {
          const updatedSubmission = freshData.submissions.find((s: RawSubmissionEntry) => s.id === selectedSubmission.id)
          if (updatedSubmission) {
            setSelectedSubmission(updatedSubmission)
          }
        }
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const navigateToSubmission = (direction: 'prev' | 'next') => {
    if (!rawData?.submissions || rawData.submissions.length === 0) return
    
    const currentIndex = selectedSubmissionIndex
    let newIndex = currentIndex
    
    if (direction === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1
    } else if (direction === 'next' && currentIndex < rawData.submissions.length - 1) {
      newIndex = currentIndex + 1
    }
    
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < rawData.submissions.length) {
      const newSubmission = rawData.submissions[newIndex]
      setSelectedSubmissionIndex(newIndex)
      setSelectedSubmission(newSubmission)
    }
  }

  async function handleDownloadCSV() {
    setIsDownloading(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"
      const response = await fetch(`${API_BASE}/api/results/download`, {
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = 'resident_ai_survey_responses.csv'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        throw new Error("Failed to download CSV")
      }
    } catch (err) {
      alert("Failed to download CSV: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setIsDownloading(false)
    }
  }


  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading dashboard...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <div className="text-red-500">No data available</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const avgHelpfulness = data.tool_effectiveness.length > 0 
    ? (data.tool_effectiveness.reduce((sum, tool) => sum + tool.avg_helpfulness, 0) / data.tool_effectiveness.length).toFixed(1)
    : "0"

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-center">Results Dashboard</h1>
        
        {/* Controls Row */}
        <div className="flex justify-center items-center gap-4">
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={activeTab === 'dashboard' ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab('dashboard')}
              className="text-sm"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Statistics
            </Button>
            <Button
              variant={activeTab === 'submissions' ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab('submissions')}
              className="text-sm"
            >
              <Table className="h-4 w-4 mr-1" />
              Raw Data
            </Button>
          </div>
          
          <Button 
            onClick={handleDownloadCSV} 
            disabled={isDownloading}
            variant="outline" 
            size="sm"
          >
            <Download className="h-4 w-4 mr-1" />
            {isDownloading ? "Downloading..." : "Download CSV"}
          </Button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today</p>
                <p className="text-xl font-bold">{data.counts.today_count}</p>
              </div>
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Week</p>
                <p className="text-xl font-bold">{data.counts.week_count}</p>
              </div>
              <BarChart3 className="h-6 w-6 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Month</p>
                <p className="text-xl font-bold">{data.counts.month_count}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Rating</p>
                <p className="text-xl font-bold">{avgHelpfulness}/10</p>
              </div>
              <Shield className="h-6 w-6 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Usage by Task */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Usage by Task
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.usage_by_task.slice(0, 6).map((task) => {
              const maxN = Math.max(...data.usage_by_task.map(t => t.n))
              return (
                <div key={task.task} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {task.task.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {task.n}
                    </Badge>
                    <div className="w-16 bg-muted rounded-full h-1.5">
                      <div 
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${(task.n / maxN) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Tool Effectiveness */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Average Helpfulness by Tool
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.tool_effectiveness.slice(0, 6).map((tool) => (
              <div key={tool.tool} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{tool.tool}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {tool.avg_helpfulness.toFixed(1)}
                  </Badge>
                  <div className="w-16 bg-muted rounded-full h-1.5">
                    <div 
                      className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(tool.avg_helpfulness / 10) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Time Saved */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Time Saved Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.time_saved_dist.map((time) => {
              const maxN = Math.max(...data.time_saved_dist.map(t => t.n))
              return (
                <div key={time.time_saved} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      {time.time_saved || "Not specified"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {time.n}
                    </Badge>
                    <div className="w-16 bg-muted rounded-full h-1.5">
                      <div 
                        className="bg-orange-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${(time.n / maxN) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Verification Confidence */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Output Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.verify_conf_dist?.map((verify) => {
              const maxN = Math.max(...data.verify_conf_dist.map(v => v.n))
              const getColor = (conf: string) => {
                if (conf === 'Yes') return 'bg-green-500'
                if (conf === 'Somewhat') return 'bg-yellow-500'
                if (conf === 'Not sure') return 'bg-orange-500'
                if (conf === 'No') return 'bg-red-500'
                return 'bg-gray-500'
              }
              return (
                <div key={verify.verify_conf} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium">{verify.verify_conf}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {verify.n}
                    </Badge>
                    <div className="w-16 bg-muted rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-500 ${getColor(verify.verify_conf)}`}
                        style={{ width: `${(verify.n / maxN) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            }) || []}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recent_activity?.slice(0, 7).map((day) => {
              const maxN = Math.max(...data.recent_activity.slice(0, 7).map(d => d.n))
              const date = new Date(day.date)
              const isToday = date.toDateString() === new Date().toDateString()
              return (
                <div key={day.date} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : ''}`}>
                      {isToday ? 'Today' : date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        weekday: 'short'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={isToday ? "default" : "secondary"} className="text-xs font-mono">
                      {day.n}
                    </Badge>
                    <div className="w-16 bg-muted rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          isToday ? 'bg-blue-500' : 'bg-gray-400'
                        }`}
                        style={{ width: `${Math.max(8, (day.n / maxN) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            }) || []}
          </CardContent>
        </Card>

        {/* Data Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Data Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Total Submissions:</span> {data.counts.total_submissions}
            </div>
            <div>
              <span className="font-medium text-foreground">Active Rotations:</span> {data.counts.unique_rotations}
            </div>
            <div>
              <span className="font-medium text-foreground">Time Range:</span> Last 30 days
            </div>
            <div className="pt-2 text-xs">
              All data is aggregated. No PHI collected.
            </div>
          </CardContent>
        </Card>
      </div>
        </>
      )}

      {activeTab === 'submissions' && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Table className="h-4 w-4" />
              Raw Submissions ({rawData?.total_count || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rawData?.submissions && rawData.submissions.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="max-h-[600px] overflow-y-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="text-left p-3 font-medium">Actions</th>
                        <th className="text-left p-3 font-medium">Engagement</th>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Resident</th>
                        <th className="text-left p-3 font-medium">Rotation</th>
                        <th className="text-left p-3 font-medium">Task</th>
                        <th className="text-left p-3 font-medium">Tool</th>
                        <th className="text-left p-3 font-medium">Used AI</th>
                        <th className="text-left p-3 font-medium">Rating</th>
                        <th className="text-left p-3 font-medium">Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.submissions.map((submission) => (
                        <tr key={submission.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const index = rawData.submissions.indexOf(submission)
                                setSelectedSubmissionIndex(index)
                                setSelectedSubmission(submission)
                                setDialogOpen(true)
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </td>
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-1">
                              {submission.likes && submission.likes.length > 0 && (
                                <span className="inline-flex items-center text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {submission.likes.length}❤️
                                </span>
                              )}
                              {submission.comments && submission.comments.length > 0 && (
                                <span className="inline-flex items-center text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {submission.comments.length}💬
                                </span>
                              )}
                              {(!submission.likes || submission.likes.length === 0) && (!submission.comments || submission.comments.length === 0) && (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(submission.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            {submission.resident_name || 'Anonymous'}
                          </td>
                          <td className="p-3">{submission.rotation}</td>
                          <td className="p-3">
                            {submission.task.replace(/([A-Z])/g, ' $1').trim()}
                          </td>
                          <td className="p-3">
                            {submission.tool === 'Other' && submission.tool_other 
                              ? submission.tool_other 
                              : submission.tool
                            }
                          </td>
                          <td className="p-3">
                            <Badge variant={submission.used_ai ? "default" : "secondary"}>
                              {submission.used_ai ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {submission.helpfulness ? `${submission.helpfulness}/10` : 'N/A'}
                          </td>
                          <td className="p-3 text-sm">{submission.verify_conf}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {rawData.total_count > rawData.submissions.length && (
                  <p className="text-sm text-muted-foreground mt-3 text-center">
                    Showing latest {rawData.submissions.length} of {rawData.total_count} submissions
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No submissions found
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Controlled Dialog for Submission Details - Only render when needed */}
      {selectedSubmission && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent key={selectedSubmission?.id || 'no-submission'} className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToSubmission('prev')}
                disabled={selectedSubmissionIndex <= 0}
                className="px-2"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-1">Previous</span>
              </Button>
              
              <DialogTitle className="text-center">Submission Details</DialogTitle>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToSubmission('next')}
                disabled={!rawData?.submissions || selectedSubmissionIndex >= rawData.submissions.length - 1}
                className="px-2"
              >
                <span className="mr-1">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-center text-sm text-muted-foreground font-medium mt-2">
              {selectedSubmissionIndex + 1} of {rawData?.submissions.length || 0}
            </div>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Date</label>
                  <p className="text-sm">{new Date(selectedSubmission.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Resident</label>
                  <p className="text-sm">{selectedSubmission.resident_name || 'Anonymous'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Rotation</label>
                  <p className="text-sm">{selectedSubmission.rotation}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Task</label>
                  <p className="text-sm">{selectedSubmission.task.replace(/([A-Z])/g, ' $1').trim()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Tool Used</label>
                  <p className="text-sm">
                    {selectedSubmission.tool === 'Other' && selectedSubmission.tool_other 
                      ? selectedSubmission.tool_other 
                      : selectedSubmission.tool
                    }
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Used AI</label>
                  <p className="text-sm">
                    <Badge variant={selectedSubmission.used_ai ? "default" : "secondary"}>
                      {selectedSubmission.used_ai ? "Yes" : "No"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Helpfulness Rating</label>
                  <p className="text-sm">{selectedSubmission.helpfulness ? `${selectedSubmission.helpfulness}/10` : 'Not rated'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Output Verified</label>
                  <p className="text-sm">{selectedSubmission.verify_conf}</p>
                </div>
                {selectedSubmission.time_saved && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Time Saved</label>
                    <p className="text-sm">{selectedSubmission.time_saved}</p>
                  </div>
                )}
              </div>

              {/* Task Description */}
              {selectedSubmission.task_description && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Task Description</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{selectedSubmission.task_description}</p>
                  </div>
                </div>
              )}

              {/* Task Image */}
              <div>
                <label className="text-sm font-medium text-gray-600">Task Image</label>
                {selectedSubmission.task_image ? (
                  <div className="mt-1 border rounded-lg overflow-hidden">
                    <img 
                      src={selectedSubmission.task_image} 
                      alt="Task illustration" 
                      className="w-full max-h-96 object-contain"
                    />
                  </div>
                ) : (
                  <div className="mt-1 p-3 bg-gray-100 rounded-lg border text-sm text-gray-600">
                    No image uploaded
                  </div>
                )}
              </div>

              {/* Free Response Notes */}
              {selectedSubmission.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Additional Notes</label>
                  <div className="mt-1 p-3 bg-blue-50 rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{selectedSubmission.notes}</p>
                  </div>
                </div>
              )}

              {/* Likes Section */}
              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-gray-600 mb-3 block">Reactions</label>
                <div className="flex gap-2 mb-4">
                  {['❤️', '👍', '👎', '🔥', '💡', '🎯'].map((emoji) => {
                    const count = (selectedSubmission.likes || []).filter(l => l.emoji === emoji).length
                    return (
                      <button
                        key={emoji}
                        onClick={() => {
                          const userName = commentAuthor || 'Anonymous'
                          handleLike(emoji, userName)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-full border hover:bg-gray-50 text-sm"
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span className="text-xs text-gray-600">{count}</span>}
                      </button>
                    )
                  })}
                </div>
                
                {selectedSubmission.likes && selectedSubmission.likes.length > 0 && (
                  <div className="text-xs text-gray-500 mb-4">
                    Recent reactions: {selectedSubmission.likes.slice(0, 3).map(like => 
                      `${like.emoji} ${like.user_name}`
                    ).join(', ')}
                    {selectedSubmission.likes.length > 3 && ` and ${selectedSubmission.likes.length - 3} more`}
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-gray-600 mb-3 block">Comments ({selectedSubmission.comments?.length || 0})</label>
                
                {/* Existing Comments */}
                {selectedSubmission.comments && selectedSubmission.comments.length > 0 && (
                  <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                    {selectedSubmission.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-medium text-gray-700">{comment.user_name}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add Comment Form */}
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Your name (or select from residents above)"
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none"
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{newComment.length}/1000</span>
                    <button
                      onClick={handleComment}
                      disabled={!newComment.trim() || !commentAuthor.trim() || isSubmittingComment}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingComment ? 'Adding...' : 'Add Comment'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Submission ID for reference */}
              <div className="pt-4 border-t">
                <label className="text-xs font-medium text-gray-500">Submission ID</label>
                <p className="text-xs font-mono text-gray-400">{selectedSubmission.id}</p>
              </div>
            </div>
          )}
        </DialogContent>
        </Dialog>
      )}
    </div>
  )
}