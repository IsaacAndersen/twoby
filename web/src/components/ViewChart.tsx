import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Share2, Plus, Trash2, Pencil, X, Check, PauseCircle, PlayCircle, ExternalLink, Copy, Download } from 'lucide-react'
import { useMetaTags } from '@/hooks/useMetaTags'
import { resolveCollisions } from '@/utils/collision'
import { createShortUrl } from '@/utils/urlShortening'
import { buildShareTargets } from '@/utils/shareLinks'
import { imageFrameSize, normalizeAxisPair } from '@/utils/chart'
import { placeItems } from '@/utils/placement'
import { API_BASE } from '@/config'
import type { ChartData } from '@/types'
import Avatar from './Avatar'

export default function ViewChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const shareKey = searchParams.get('s')
  const adminKey = searchParams.get('k')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showImages, setShowImages] = useState(true)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [isUpdatingVotingState, setIsUpdatingVotingState] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  const effectiveShareKey = shareKey || 'public'

  const hasImages = useMemo(
    () => chart?.items.some(i => i.image_url) ?? false,
    [chart],
  )

  useEffect(() => {
    if (!shareMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (!(e.target as HTMLElement)?.closest('[data-share-menu]')) {
        setShareMenuOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [shareMenuOpen])

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

  async function copyLink(type: 'results' | 'voting') {
    const path = type === 'voting' ? `/v/${id}` : `/c/${id}`
    try {
      const params = new URLSearchParams()
      params.set('s', effectiveShareKey)
      const shortUrl = await createShortUrl(path, params, chart?.title)
      await navigator.clipboard.writeText(shortUrl)
    } catch {
      await navigator.clipboard.writeText(`${window.location.origin}${path}?s=${effectiveShareKey}`)
    }
    setCopiedLink(type)
    setShareMenuOpen(false)
    setTimeout(() => setCopiedLink(null), 1500)
  }

  async function openSocialShare(target: 'x' | 'reddit' | 'facebook') {
    let url = `${window.location.origin}/c/${id}?s=${effectiveShareKey}`
    try {
      const params = new URLSearchParams()
      params.set('s', effectiveShareKey)
      url = await createShortUrl(`/c/${id}`, params, chart?.title)
    } catch { /* fallback */ }
    const links = buildShareTargets(url, `${chart?.title || 'Chart'} on twoby`)
    window.open(links[target], '_blank', 'noopener,noreferrer')
    setShareMenuOpen(false)
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

  const twoAxisData = useMemo(() => {
    if (!chart) return null
    const itemsWithPositions = placeItems(chart.items)
    const collisionInput = itemsWithPositions.map(i => ({ id: i.id, x: i.xPos, y: i.yPos, label: i.label }))
    const adjusted = resolveCollisions(collisionInput, 100, 100, 22, 12)
    const adjustedMap = new Map(adjusted.map(a => [a.id, a]))
    return { itemsWithPositions, adjustedMap }
  }, [chart])

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

  const xLabels = normalizeAxisPair(chart.x_label, 'Low', 'High')
  const yLabels = normalizeAxisPair(chart.y_label, 'Low', 'High')

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

          <div className="relative" data-share-menu>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setShareMenuOpen(prev => !prev) }}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            {shareMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => copyLink('voting')}>
                  <Copy className="h-3.5 w-3.5 text-slate-400" /> Copy voting link
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => copyLink('results')}>
                  <Copy className="h-3.5 w-3.5 text-slate-400" /> Copy results link
                </button>
                <div className="my-1 h-px bg-slate-100" />
                <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => openSocialShare('x')}>
                  Share to X <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <button type="button" className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => openSocialShare('reddit')}>
                  Share to Reddit <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            )}
          </div>

          {hasImages && (
            <button type="button" onClick={() => setShowImages(!showImages)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${showImages ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {showImages ? 'Hide images' : 'Show images'}
            </button>
          )}
        </div>
      </div>

      {copiedLink && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Copied {copiedLink} link
        </div>
      )}

      {twoAxisData && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="relative mx-auto w-full max-w-4xl" style={{ aspectRatio: '1' }}>
            <div className="absolute inset-0 rounded-2xl bg-white" />

            <div className="absolute bottom-6 left-1/2 top-6 w-px -translate-x-1/2 bg-slate-900" />
            <div className="absolute left-1/2 top-4 -translate-x-1/2 border-b-[10px] border-l-[6px] border-r-[6px] border-transparent border-b-slate-900" />

            <div className="absolute left-6 right-6 top-1/2 h-px -translate-y-1/2 bg-slate-900" />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 border-l-[10px] border-b-[6px] border-t-[6px] border-transparent border-l-slate-900" />

            <div className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold text-slate-700">{yLabels[1]}</div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold text-slate-700">{yLabels[0]}</div>
            <div className="absolute left-1 top-1/2 translate-y-2 whitespace-nowrap text-[13px] font-semibold text-slate-700">{xLabels[0]}</div>
            <div className="absolute right-1 top-1/2 translate-y-2 whitespace-nowrap text-[13px] font-semibold text-slate-700">{xLabels[1]}</div>

            <div className="absolute inset-10">
              {twoAxisData.itemsWithPositions.map((item) => {
                const adjusted = twoAxisData.adjustedMap.get(item.id)
                const xPos = adjusted?.x ?? item.xPos
                const yPos = adjusted?.y ?? item.yPos

                return (
                  <div
                    key={item.id}
                    className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-all hover:z-20 hover:scale-110 ${!item.hasData ? 'opacity-60' : ''}`}
                    style={{ left: `${Math.max(5, Math.min(95, xPos))}%`, top: `${Math.max(5, Math.min(95, yPos))}%` }}
                  >
                    {item.image_url && showImages ? (
                      <div className="flex flex-col items-center">
                        <div className="overflow-hidden rounded-md border border-slate-200/80 bg-white/90 shadow-sm" style={imageFrameSize(item.id)}>
                          <img src={item.image_url} alt={item.label} className="h-full w-full object-cover" />
                        </div>
                        <span className="mt-1 max-w-[118px] truncate rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">{item.label}</span>
                      </div>
                    ) : (
                      <span className={`whitespace-nowrap rounded px-2.5 py-1.5 text-sm font-semibold shadow-sm ${item.hasData ? 'bg-white/80 text-slate-900' : 'border border-dashed border-slate-300 bg-slate-100/80 text-slate-600'}`}>
                        {item.label}
                      </span>
                    )}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow-lg">
                        {item.label}{!item.hasData && <span className="ml-1 text-slate-400">(needs votes)</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {twoAxisData.itemsWithPositions.filter(i => !i.hasData).length > twoAxisData.itemsWithPositions.length / 2 && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-slate-500">
                Vote to see where items land
              </div>
            )}
          </div>
        </div>
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
    </div>
  )
}
