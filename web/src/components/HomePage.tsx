import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search } from 'lucide-react'
import { formatRelativeTime } from '@/utils/timeFormatting'
import { API_BASE } from '@/config'
import type { Item } from '@/types'
import ChartBoard from './ChartBoard'

type FeedFilter = 'trending' | 'new' | 'featured'

interface FeedChart {
  id: string
  title: string
  item_count: number
  vote_count: number
  created_at: string
  x_label?: string
  y_label?: string
  preview_items?: Item[]
}

const PAGE_SIZE = 12

const FILTERS: Array<{ value: FeedFilter; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'new', label: 'New' },
  { value: 'featured', label: 'Featured' },
]

function parseFilter(value: string | null): FeedFilter {
  if (value === 'new' || value === 'featured') return value
  return 'trending'
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('filter'))
  const query = (searchParams.get('q') || '').trim()

  const [charts, setCharts] = useState<FeedChart[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(0)
  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(true)

  const visibleCharts = useMemo(() => {
    if (!query) return charts
    const q = query.toLowerCase()
    return charts.filter((chart) =>
      chart.title.toLowerCase().includes(q)
      || (chart.x_label || '').toLowerCase().includes(q)
      || (chart.y_label || '').toLowerCase().includes(q),
    )
  }, [charts, query])

  const loadMore = useCallback(async (reset: boolean) => {
    if (isLoadingRef.current) return
    if (!hasMoreRef.current && !reset) return

    isLoadingRef.current = true
    setIsLoading(true)
    setError(null)

    const nextOffset = reset ? 0 : offsetRef.current
    try {
      const response = await fetch(
        `${API_BASE}/api/charts/feed?filter=${filter}&limit=${PAGE_SIZE}&offset=${nextOffset}&mode=two_axis`,
      )
      if (!response.ok) throw new Error(`Failed to load feed (${response.status})`)

      const data = (await response.json()) as FeedChart[]
      setCharts((prev) => {
        if (reset) return data
        const existing = new Set(prev.map((c) => c.id))
        const merged = [...prev]
        for (const item of data) {
          if (existing.has(item.id)) continue
          merged.push(item)
          existing.add(item.id)
        }
        return merged
      })
      offsetRef.current = nextOffset + data.length
      hasMoreRef.current = data.length === PAGE_SIZE
      setHasMore(data.length === PAGE_SIZE)
    } catch (e: unknown) {
      console.error(e)
      setError('Failed to load feed.')
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setCharts([])
    offsetRef.current = 0
    hasMoreRef.current = true
    setHasMore(true)
    void loadMore(true)
  }, [loadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(false) },
      { rootMargin: '700px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  function setFilter(next: FeedFilter) {
    const params = new URLSearchParams(searchParams)
    params.set('filter', next)
    setSearchParams(params, { replace: true })
  }

  function setQuery(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next.trim()) params.set('q', next.trim())
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="relative block w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none ring-blue-200 transition focus:ring"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {visibleCharts.length === 0 && isLoading ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-[380px] animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : visibleCharts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
          <h2 className="text-xl font-semibold text-slate-900">No charts yet</h2>
          <p className="mt-1 text-sm text-slate-500">Be the first.</p>
          <div className="mt-4">
            <Link to="/create"><Button size="sm">Create chart</Button></Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visibleCharts.map((chart) => {
            const resultsUrl = `/c/${chart.id}?s=public`
            const voteUrl = `/v/${chart.id}?s=public`
            const time = formatRelativeTime(chart.created_at)

            return (
              <Card key={chart.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <Link to={resultsUrl} className="block">
                  <ChartBoard
                    title={chart.title}
                    xLabel={chart.x_label}
                    yLabel={chart.y_label}
                    items={chart.preview_items || []}
                    voteCount={chart.vote_count}
                    showTitle={true}
                    showBranding={true}
                  />
                </Link>

                <CardHeader className="px-5 pb-2 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="overflow-hidden text-xl leading-tight tracking-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {chart.title}
                    </CardTitle>
                    <span className="shrink-0 text-xs text-slate-400" title={time.absolute}>
                      {time.relative}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-5 pb-5 pt-0">
                  <div className="mb-3 flex items-center gap-3 text-sm text-slate-500">
                    <span className="tabular-nums">{chart.vote_count} votes</span>
                    <span>&middot;</span>
                    <span>{chart.item_count} items</span>
                  </div>

                  <div className="flex gap-2">
                    <Link to={voteUrl} className="flex-1">
                      <Button className="w-full" size="sm">Vote</Button>
                    </Link>
                    <Link to={resultsUrl} className="flex-1">
                      <Button variant="outline" className="w-full" size="sm">Results</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div ref={sentinelRef} className="h-10" />

      {visibleCharts.length > 0 && (
        <div className="pb-4 text-center text-sm text-slate-400">
          {isLoading ? 'Loading...' : hasMore ? '' : 'That\'s everything'}
        </div>
      )}
    </div>
  )
}
