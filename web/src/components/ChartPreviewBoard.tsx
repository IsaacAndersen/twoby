import type { Item } from '@/types'
import { imageFrameSize, scoreToPosition, normalizeAxisPair } from '@/utils/chart'

interface ChartPreviewBoardProps {
  title: string
  voteCount: number
  itemCount: number
  xLabel?: string
  yLabel?: string
  items: Item[]
}

interface Point extends Item {
  xPos: number
  yPos: number
  hasData: boolean
}

function compactLabel(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function initials(label: string): string {
  return label
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function groupByQuadrant(points: Point[]): Record<'tl' | 'tr' | 'bl' | 'br', Point[]> {
  const groups: Record<'tl' | 'tr' | 'bl' | 'br', Point[]> = {
    tl: [],
    tr: [],
    bl: [],
    br: [],
  }

  for (const point of points) {
    const isRight = point.xPos >= 50
    const isTop = point.yPos <= 50
    const key = isTop ? (isRight ? 'tr' : 'tl') : (isRight ? 'br' : 'bl')
    groups[key].push(point)
  }

  for (const key of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[key].sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      const aDist = Math.abs(a.xPos - 50) + Math.abs(a.yPos - 50)
      const bDist = Math.abs(b.xPos - 50) + Math.abs(b.yPos - 50)
      return bDist - aDist
    })
  }

  return groups
}

function QuadrantColumn({ items }: { items: Point[] }) {
  const shown = items.slice(0, 3)
  const hiddenCount = Math.max(0, items.length - shown.length)

  return (
    <div className="flex h-full flex-col gap-1">
      {shown.map((point) => {
        const shape = imageFrameSize(point.id, 20, 8)
        const pointLabel = compactLabel(point.label, 16)

        return (
          <div
            key={point.id}
            className={`flex min-h-[28px] items-center gap-1 rounded-md border border-slate-500/70 bg-slate-800/88 px-1.5 py-1 shadow-sm ${
              point.hasData ? 'opacity-100' : 'opacity-75'
            }`}
          >
            <div
              className="overflow-hidden rounded-sm bg-slate-700"
              style={{ width: `${shape.width}px`, height: `${shape.height}px` }}
            >
              {point.image_url ? (
                <img src={point.image_url} alt={point.label} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-700 text-[9px] font-semibold text-slate-100">
                  {initials(point.label)}
                </div>
              )}
            </div>
            <div className="truncate text-[11px] font-medium text-slate-100">{pointLabel}</div>
          </div>
        )
      })}

      {hiddenCount > 0 && (
        <div className="truncate px-1 text-[10px] font-medium text-slate-300">+{hiddenCount} more</div>
      )}
    </div>
  )
}

export default function ChartPreviewBoard({
  title,
  voteCount,
  itemCount,
  xLabel,
  yLabel,
  items,
}: ChartPreviewBoardProps) {
  const points: Point[] = items.slice(0, 12).map((item) => {
    const { xPos, yPos, hasData } = scoreToPosition(item)
    return { ...item, xPos, yPos, hasData }
  })

  const groups = groupByQuadrant(points)

  const [xLowRaw, xHighRaw] = normalizeAxisPair(xLabel, 'Low', 'High')
  const [yLowRaw, yHighRaw] = normalizeAxisPair(yLabel, 'Low', 'High')
  const xLow = compactLabel(xLowRaw, 16)
  const xHigh = compactLabel(xHighRaw, 16)
  const yLow = compactLabel(yLowRaw, 16)
  const yHigh = compactLabel(yHighRaw, 16)

  return (
    <div className="relative w-full aspect-[1200/630] overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(96,165,250,0.12),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.08),transparent_50%)]" />

      <div className="absolute left-4 right-[50%] top-4 sm:left-6 sm:top-6">
        <div className="inline-flex rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-semibold text-slate-200">
          twoby
        </div>
        <h3 className="mt-3 overflow-hidden text-[clamp(1.5rem,2.1vw,2.85rem)] font-bold leading-[1.02] tracking-tight text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {title}
        </h3>
        <div className="mt-2 text-[12px] text-slate-300 sm:text-base">
          Results • 2×2 • {itemCount} items • {voteCount} votes
        </div>
      </div>

      <div className="absolute bottom-4 left-4 text-[11px] text-slate-500 sm:left-6 sm:text-sm">twoby</div>

      <div className="absolute inset-y-4 left-[50%] right-3 rounded-2xl border border-slate-600/70 bg-slate-900/42 sm:inset-y-6 sm:right-6">
        <div className="absolute left-1/2 top-[8%] bottom-[12%] w-px bg-slate-500/80 -translate-x-1/2" />
        <div className="absolute top-1/2 left-[6%] right-[6%] h-px bg-slate-500/80 -translate-y-1/2" />

        <div className="absolute bottom-2 left-3 text-[9px] text-slate-300 sm:text-[11px]">{xLow}</div>
        <div className="absolute bottom-2 right-3 text-[9px] text-slate-300 sm:text-[11px]">{xHigh}</div>
        <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[9px] text-slate-300 sm:text-[11px]">{yHigh}</div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-slate-300 sm:text-[11px]">{yLow}</div>

        <div className="absolute left-[6%] right-[52%] top-[11%] bottom-[52%]">
          <QuadrantColumn items={groups.tl} />
        </div>
        <div className="absolute left-[52%] right-[6%] top-[11%] bottom-[52%]">
          <QuadrantColumn items={groups.tr} />
        </div>
        <div className="absolute left-[6%] right-[52%] top-[52%] bottom-[12%]">
          <QuadrantColumn items={groups.bl} />
        </div>
        <div className="absolute left-[52%] right-[6%] top-[52%] bottom-[12%]">
          <QuadrantColumn items={groups.br} />
        </div>
      </div>
    </div>
  )
}
