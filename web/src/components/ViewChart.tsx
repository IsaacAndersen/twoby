import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Share2, Plus, Trash2, Pencil, X, Check, PauseCircle, PlayCircle, Download } from 'lucide-react'
import { useMetaTags } from '@/hooks/useMetaTags'
import { API_BASE } from '@/config'
import type { ChartData } from '@/types'
import ChartBoard from './ChartBoard'
import ShareOverlay from './ShareOverlay'

export default function ViewChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const shareKey = searchParams.get('s')
  const adminKey = searchParams.get('k')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [isUpdatingVotingState, setIsUpdatingVotingState] = useState(false)
  const [showShareOverlay, setShowShareOverlay] = useState(false)

  const effectiveShareKey = shareKey || 'public'

  async function addItem() {
    if (!id || !adminKey || !newItemLabel.trim()) return
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/items?k=${adminKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ label: newItemLabel.trim() }] })
      })
      if (response.ok) {
        setNewItemLabel('')
        loadChart()
      }
    } catch (error) {
      console.error('Failed to add item:', error)
    }
  }

  async function deleteItem(itemId: string) {
    if (!id || !adminKey) return
    if (!confirm('Delete this item?')) return
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/items/${itemId}?k=${adminKey}`, { method: 'DELETE' })
      if (response.ok) loadChart()
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }

  async function updateItem(itemId: string, newLabel: string) {
    if (!id || !adminKey || !newLabel.trim()) return
    try {
      const response = await fetch(
        `${API_BASE}/api/charts/${id}/items/${itemId}?k=${adminKey}&label=${encodeURIComponent(newLabel.trim())}`,
        { method: 'PUT' }
      )
      if (response.ok) {
        setEditingItemId(null)
        loadChart()
      }
    } catch (error) {
      console.error('Failed to update item:', error)
    }
  }

  async function toggleVotingPause() {
    if (!id || !adminKey || !chart) return
    setIsUpdatingVotingState(true)
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/owner-settings?k=${adminKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_voting_paused: !chart.is_voting_paused }),
      })
      if (!response.ok) throw new Error('Failed')
      await loadChart()
    } catch (error) {
      console.error(error)
    } finally {
      setIsUpdatingVotingState(false)
    }
  }

  const exportCSV = async () => {
    if (!id || !adminKey) return
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/export-csv?k=${adminKey}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chart_${id}_export.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Failed to export CSV:', error)
    }
  }

  useMetaTags({
    title: chart ? `${chart.title} - twoby` : 'twoby',
    description: chart ? `Results for "${chart.title}" on twoby` : 'Collaborative 2x2 charts',
    url: window.location.href,
    image: id
      ? `${API_BASE}/api/og/chart/${id}?s=${encodeURIComponent(effectiveShareKey)}&type=results`
      : `${window.location.origin}/og-default.png`
  })

  useEffect(() => {
    loadChart()
  }, [id, shareKey, adminKey])

  async function loadChart() {
    if (!id) return
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/public?s=${effectiveShareKey}`)
      if (!response.ok) throw new Error('Chart not found')
      setChart(await response.json())
    } catch (error) {
      console.error('Error loading chart:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    )
  }

  if (!chart) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Chart not found</h2>
        <Link to="/"><Button variant="outline">Back to Home</Button></Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{chart.title}</h1>
          {chart.description && (
            <p className="mt-1.5 text-sm text-slate-500">{chart.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <span>{chart.items.length} items</span>
            {chart.voting_active === false && (
              <>
                <span className="text-slate-300">&middot;</span>
                <span className="text-amber-600">Voting paused</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/v/${id}?s=${effectiveShareKey}`}>
            <Button size="sm">Vote</Button>
          </Link>

          <Button variant="outline" size="sm" onClick={() => setShowShareOverlay(true)}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>

        </div>
      </div>

      {chart.mode === 'two_axis' && (
        <ChartBoard
          title={chart.title}
          xLabel={chart.x_label}
          yLabel={chart.y_label}
          items={chart.items}
          voteCount={0}
          interactive={true}
          showTitle={false}
          showBranding={false}
        />
      )}

      {chart.creator_take && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-900">Creator's take</div>
          <div className="mt-1 text-sm text-slate-600">{chart.creator_take}</div>
        </div>
      )}

      {adminKey && (
        <div className="mt-8 border-t border-slate-200 pt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Admin</h3>
            <div className="flex flex-wrap gap-2">
              <Button onClick={toggleVotingPause} variant="outline" size="sm" disabled={isUpdatingVotingState}>
                {chart.is_voting_paused ? <PlayCircle className="mr-1.5 h-4 w-4" /> : <PauseCircle className="mr-1.5 h-4 w-4" />}
                {chart.is_voting_paused ? 'Resume' : 'Pause'}
              </Button>
              <Button onClick={() => setShowEditPanel(!showEditPanel)} variant={showEditPanel ? 'default' : 'outline'} size="sm">
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
              <Button onClick={exportCSV} variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </div>
          </div>

          {showEditPanel && (
            <Card className="mb-4 border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Edit Items</CardTitle>
                <CardDescription>Add, remove, or rename items</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)} placeholder="New item..." onKeyDown={(e) => e.key === 'Enter' && addItem()} className="bg-white" />
                  <Button onClick={addItem} disabled={!newItemLabel.trim()}><Plus className="mr-1 h-4 w-4" /> Add</Button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {chart.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                      {editingItemId === item.id ? (
                        <>
                          <Input value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} className="h-8 flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') updateItem(item.id, editingLabel); if (e.key === 'Escape') setEditingItemId(null) }} />
                          <Button size="sm" variant="ghost" onClick={() => updateItem(item.id, editingLabel)}><Check className="h-4 w-4 text-emerald-600" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)}><X className="h-4 w-4 text-slate-500" /></Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{item.label}</span>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(item.id); setEditingLabel(item.label) }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)} className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showShareOverlay && chart && (
        <ShareOverlay
          chartId={id!}
          title={chart.title}
          xLabel={chart.x_label}
          yLabel={chart.y_label}
          items={chart.items}
          voteCount={0}
          shareKey={effectiveShareKey}
          onClose={() => setShowShareOverlay(false)}
        />
      )}
    </div>
  )
}
