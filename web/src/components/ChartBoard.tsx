import { useMemo } from 'react'
import type { Item } from '@/types'
import { seededRandom, imageFrameSize, normalizeAxisPair } from '@/utils/chart'
import { placeItems, type PlacedItem } from '@/utils/placement'
import { resolveCollisions } from '@/utils/collision'

export interface ChartBoardProps {
  title: string
  xLabel?: string
  yLabel?: string
  items: Item[]
  voteCount: number
  interactive?: boolean
  showTitle?: boolean
  showBranding?: boolean
}

function itemColor(hasData: boolean, confidence: number): string {
  if (!hasData) return 'text-stone-300'
  if (confidence < 0.5) return 'text-stone-400'
  return 'text-stone-900'
}

function itemRotation(id: string): number {
  return (seededRandom(id + '-rot') - 0.5) * 4
}

function ChartItem({
  item,
  xPos,
  yPos,
  interactive,
}: {
  item: PlacedItem
  xPos: number
  yPos: number
  interactive: boolean
}) {
  const { hasData, confidence, id, label, image_url } = item
  const rotation = itemRotation(id)
  const color = itemColor(hasData, confidence)
  const baseFontSize = 14 + 8 * (0.6 + confidence * 0.4)

  const interactiveClasses = interactive
    ? 'group hover:z-20 hover:scale-110 transition-transform'
    : ''

  return (
    <div
      className={`absolute ${interactiveClasses}`}
      style={{
        left: `${Math.max(2, Math.min(98, xPos))}%`,
        top: `${Math.max(2, Math.min(98, yPos))}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
    >
      {image_url ? (
        <div className="flex flex-col items-center">
          <img
            src={image_url}
            alt={label}
            crossOrigin="anonymous"
            loading="lazy"
            className="object-contain"
            style={imageFrameSize(id, 40, 40)}
          />
          <span
            className={`mt-0.5 max-w-[80px] truncate text-center text-[clamp(9px,1.5cqw,12px)] font-bold leading-tight ${color}`}
          >
            {label}
          </span>
        </div>
      ) : (
        <span
          className={`whitespace-nowrap font-bold ${color}`}
          style={{ fontSize: `clamp(${baseFontSize * 0.6}px, ${baseFontSize * 0.25}cqw, ${baseFontSize}px)` }}
        >
          {label}
        </span>
      )}

      {interactive && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="whitespace-nowrap rounded bg-stone-900 px-2 py-1 text-xs text-white shadow-lg">
            {label}
            {!hasData && <span className="ml-1 text-stone-400">(needs votes)</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChartBoard({
  title,
  xLabel,
  yLabel,
  items,
  voteCount,
  interactive = false,
  showTitle = true,
  showBranding = true,
}: ChartBoardProps) {
  const [xLow, xHigh] = normalizeAxisPair(xLabel, 'Low', 'High')
  const [yLow, yHigh] = normalizeAxisPair(yLabel, 'Low', 'High')

  const placedItems = useMemo(() => {
    if (items.length === 0) return []
    const placed = placeItems(items)
    const collisionInput = placed.map(i => ({ id: i.id, x: i.xPos, y: i.yPos, label: i.label }))
    const adjusted = resolveCollisions(collisionInput, 100, 100, 12, 8)
    const adjustedMap = new Map(adjusted.map(a => [a.id, a]))
    return placed.map(item => {
      const adj = adjustedMap.get(item.id)
      return {
        item,
        xPos: adj?.x ?? item.xPos,
        yPos: adj?.y ?? item.yPos,
      }
    })
  }, [items])

  return (
    <div
      className="relative aspect-square w-full bg-white overflow-hidden"
      style={{ containerType: 'inline-size' }}
    >
      {showTitle && (
        <div className="absolute left-[4%] top-[3%] z-10 max-w-[42%]">
          <div
            className="font-black leading-tight text-stone-900"
            style={{ fontSize: 'clamp(10px, 3.5cqw, 28px)' }}
          >
            {title}
          </div>
          <div
            className="mt-0.5 text-stone-400"
            style={{ fontSize: 'clamp(8px, 2cqw, 14px)' }}
          >
            {voteCount} votes
          </div>
        </div>
      )}

      {showBranding && (
        <div
          className="absolute bottom-[2%] right-[3%] z-10 font-semibold text-stone-300 select-none"
          style={{ fontSize: 'clamp(7px, 1.5cqw, 11px)' }}
        >
          twoby
        </div>
      )}

      <div className="absolute inset-[10%]">
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-stone-900" />
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-[7px]"
          style={{
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '8px solid rgb(28 25 23)',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-[7px]"
          style={{
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '8px solid rgb(28 25 23)',
          }}
        />

        <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-stone-900" />
        <div
          className="absolute top-1/2 -translate-y-1/2 -right-[7px]"
          style={{
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: '8px solid rgb(28 25 23)',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -left-[7px]"
          style={{
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '8px solid rgb(28 25 23)',
          }}
        />

        <div className="absolute inset-[6%]">
          {placedItems.map(({ item, xPos, yPos }) => (
            <ChartItem
              key={item.id}
              item={item}
              xPos={xPos}
              yPos={yPos}
              interactive={interactive}
            />
          ))}
        </div>
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 font-semibold text-stone-700 whitespace-nowrap"
        style={{
          top: '2%',
          fontSize: 'clamp(7px, 2cqw, 13px)',
        }}
      >
        {yHigh}
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 font-semibold text-stone-700 whitespace-nowrap"
        style={{
          bottom: '2%',
          fontSize: 'clamp(7px, 2cqw, 13px)',
        }}
      >
        {yLow}
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 font-semibold text-stone-700 whitespace-nowrap"
        style={{
          left: '1%',
          fontSize: 'clamp(7px, 2cqw, 13px)',
        }}
      >
        {xLow}
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 font-semibold text-stone-700 whitespace-nowrap"
        style={{
          right: '1%',
          fontSize: 'clamp(7px, 2cqw, 13px)',
        }}
      >
        {xHigh}
      </div>
    </div>
  )
}
