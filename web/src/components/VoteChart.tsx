import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useMetaTags } from '@/hooks/useMetaTags'
import { SmartPairSelector } from '@/utils/pairSelection'
import { getAxisHighValue } from '@/utils/chart'
import { API_BASE } from '@/config'
import type { Item, ChartData } from '@/types'
import Avatar from './Avatar'

export default function VoteChart() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const shareKey = searchParams.get('s')
  const [chart, setChart] = useState<ChartData | null>(null)
  const [pairA, setPairA] = useState<Item | null>(null)
  const [pairB, setPairB] = useState<Item | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentAxis, setCurrentAxis] = useState<'x' | 'y'>('x')
  const [voteCount, setVoteCount] = useState(0)
  const [axisVoteCounts, setAxisVoteCounts] = useState({ x: 0, y: 0 })
  const [currentPhase, setCurrentPhase] = useState<'x_phase' | 'y_phase' | 'mixed_phase'>('x_phase')
  const [showImages, setShowImages] = useState(true)
  const [pairSelector, setPairSelector] = useState<SmartPairSelector | null>(null)

  const handlePairVoteRef = useRef(handlePairVote)
  handlePairVoteRef.current = handlePairVote

  const voteLimit = useMemo(
    () => chart ? Math.min(10, Math.max(2, Math.ceil(chart.items.length * 0.7))) : 10,
    [chart],
  )

  const hasImages = useMemo(
    () => chart?.items.some(i => i.image_url) ?? false,
    [chart],
  )

  function renderItem(item: Item) {
    if (hasImages && showImages) {
      return (
        <div className="flex flex-col items-center gap-2.5">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.label}
              className="h-16 w-16 rounded-lg object-contain sm:h-20 sm:w-20"
            />
          ) : (
            <Avatar src={undefined} name={item.label} size="lg" />
          )}
          <span className="text-center font-semibold leading-tight">{item.label}</span>
        </div>
      )
    }

    return <span className="font-semibold">{item.label}</span>
  }

  function formatTimeRemaining(endTime: string): string {
    try {
      const end = new Date(endTime.replace('Z', '+00:00'))
      const diff = end.getTime() - Date.now()
      if (diff <= 0) return 'Voting ended'
      const days = Math.floor(diff / 86_400_000)
      const hours = Math.floor((diff % 86_400_000) / 3_600_000)
      const minutes = Math.floor((diff % 3_600_000) / 60_000)
      if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`
      if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`
      return `${minutes} minute${minutes === 1 ? '' : 's'} left`
    } catch {
      return 'Time remaining unknown'
    }
  }

  useMetaTags({
    title: chart ? `Vote: ${chart.title} - twoby` : 'twoby',
    description: chart ? `Vote on "${chart.title}"` : 'Vote on 2x2 charts',
    url: window.location.href,
    image: id && shareKey
      ? `${API_BASE}/api/og/chart/${id}?s=${encodeURIComponent(shareKey)}&type=vote`
      : `${window.location.origin}/og-default.png`
  })

  useEffect(() => {
    loadChart()
    const saved = sessionStorage.getItem(`votes_${id}`)
    if (saved) setVoteCount(parseInt(saved))
    if (id) setPairSelector(new SmartPairSelector(id))
  }, [id, shareKey])

  useEffect(() => {
    function handleKeyPress(event: KeyboardEvent) {
      if (!pairA || !pairB || chart?.voting_active === false) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePairVoteRef.current(pairA)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        handlePairVoteRef.current(pairB)
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [pairA, pairB, chart?.voting_active])

  async function loadChart() {
    if (!id || !shareKey) return
    try {
      const response = await fetch(`${API_BASE}/api/charts/${id}/public?s=${shareKey}`)
      if (!response.ok) throw new Error('Chart not found')
      const data = await response.json()
      setChart(data)
      generatePair(data.items)
    } catch (error) {
      console.error('Error loading chart:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function generatePair(items: Item[]) {
    if (items.length < 2) return
    if (pairSelector) {
      const smartPair = pairSelector.selectPair(items)
      if (smartPair) {
        setPairA(smartPair[0])
        setPairB(smartPair[1])
        pairSelector.recordPairShown(smartPair[0], smartPair[1])
        return
      }
    }
    const shuffled = [...items].sort(() => Math.random() - 0.5)
    setPairA(shuffled[0])
    setPairB(shuffled[1])
  }

  async function handlePairVote(winner: Item, axis?: 'x' | 'y') {
    if (!pairA || !pairB || !shareKey || !chart) return
    if (chart.voting_active === false) return

    try {
      const response = await fetch(`${API_BASE}/api/vote/pair?s=${shareKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_id: id,
          axis: axis || currentAxis,
          item_a: pairA.id,
          item_b: pairB.id,
          winner: winner.id
        })
      })

      if (!response.ok) {
        if (response.status === 409) {
          setChart(prev => prev ? { ...prev, voting_active: false } : prev)
          return
        }
        throw new Error(`Vote failed (${response.status})`)
      }

      const newCount = voteCount + 1
      setVoteCount(newCount)
      sessionStorage.setItem(`votes_${id}`, newCount.toString())

      if (newCount === voteLimit) {
        setTimeout(() => navigate(`/c/${id}?s=${shareKey}`), 800)
        return
      }

      if (chart.mode === 'two_axis') {
        const effectiveAxis = axis || currentAxis
        const newAxisCounts = {
          ...axisVoteCounts,
          [effectiveAxis]: axisVoteCounts[effectiveAxis] + 1
        }
        setAxisVoteCounts(newAxisCounts)

        const halfLimit = Math.ceil(voteLimit / 2)
        if (currentPhase === 'x_phase' && newAxisCounts.x >= halfLimit) {
          setCurrentPhase('y_phase')
          setCurrentAxis('y')
        } else if (currentPhase === 'y_phase' && newAxisCounts.y >= halfLimit) {
          setCurrentPhase('mixed_phase')
          setCurrentAxis(effectiveAxis === 'x' ? 'y' : 'x')
        }
      }

      generatePair(chart.items)
    } catch (error) {
      console.error('Error voting:', error)
    }
  }

  const progressPercent = Math.min(100, (voteCount / voteLimit) * 100)
  const isComplete = voteCount >= voteLimit

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
    <div className="mx-auto flex min-h-[calc(100vh-200px)] max-w-2xl flex-col px-4 py-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{chart.title}</h1>
        {chart.description && (
          <p className="mt-1.5 text-sm text-slate-500">{chart.description}</p>
        )}
        {chart.ends_at && (
          <span className={`mt-1 inline-block text-xs font-medium ${chart.voting_active ? 'text-amber-600' : 'text-red-600'}`}>
            {formatTimeRemaining(chart.ends_at)}
          </span>
        )}
      </div>

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="tabular-nums text-slate-500">{voteCount} / {voteLimit} votes</span>
          {isComplete ? (
            <span className="font-medium text-emerald-600">Results unlocked</span>
          ) : (
            <span className="text-slate-400">{voteLimit - voteCount} to go</span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-slate-900'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {isComplete && (
          <div className="mt-3 text-center">
            <Button
              onClick={() => navigate(`/c/${id}?s=${shareKey}`)}
              className="bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              View Results
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {chart.voting_active === false && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm font-medium text-red-700">Voting has ended for this chart.</p>
          <Button onClick={() => navigate(`/c/${id}?s=${shareKey}`)} size="sm" className="mt-2">
            View Results
          </Button>
        </div>
      )}

      {chart.voting_active !== false && hasImages && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowImages(!showImages)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              showImages
                ? 'border-slate-300 bg-slate-100 text-slate-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {showImages ? 'Hide images' : 'Show images'}
          </button>
        </div>
      )}

      {pairA && pairB && chart.voting_active !== false && (
        <div className="flex flex-1 flex-col">
          <div className="mb-8 text-center">
            {chart.mode === 'two_axis' && (
              <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setCurrentAxis('x')}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    currentAxis === 'x'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {chart.x_label || 'X-axis'}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentAxis('y')}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    currentAxis === 'y'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {chart.y_label || 'Y-axis'}
                </button>
              </div>
            )}
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Which is more "{getAxisHighValue(currentAxis === 'x' ? chart.x_label : chart.y_label)}"?
            </h2>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="relative grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
              <button
                type="button"
                className="flex h-36 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-6 text-lg font-medium text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 sm:h-44 sm:text-xl"
                onClick={() => handlePairVote(pairA)}
              >
                {renderItem(pairA)}
              </button>

              <button
                type="button"
                className="flex h-36 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-6 text-lg font-medium text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 sm:h-44 sm:text-xl"
                onClick={() => handlePairVote(pairB)}
              >
                {renderItem(pairB)}
              </button>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">&larr;</kbd>
                <span>or</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px]">&rarr;</kbd>
                <span className="ml-1">to vote with keyboard</span>
              </div>
              <button
                type="button"
                className="text-sm text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => generatePair(chart.items)}
              >
                Skip this pair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
