import type { Item } from '@/types'

export function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  const x = Math.sin(hash) * 10000
  return x - Math.floor(x)
}

export function imageFrameSize(seed: string, baseMin = 40, baseRange = 20): { width: number; height: number } {
  const ratios: Array<[number, number]> = [[1, 1], [5, 4], [4, 5], [3, 2], [2, 3]]
  const ratio = ratios[Math.floor(seededRandom(`${seed}-ratio`) * ratios.length)]
  const base = baseMin + Math.floor(seededRandom(`${seed}-size`) * baseRange)
  const [rw, rh] = ratio
  if (rw >= rh) return { width: Math.round(base * (rw / rh)), height: base }
  return { width: base, height: Math.round(base * (rh / rw)) }
}

export function scoreToPosition(item: Item): { xPos: number; yPos: number; hasData: boolean } {
  const hasXData = (item.x_mu !== undefined && item.x_mu !== null)
    || (item.r_x !== undefined && Math.abs(item.r_x - 1000) > 5)
  const hasYData = (item.y_mu !== undefined && item.y_mu !== null)
    || (item.r_y !== undefined && Math.abs(item.r_y - 1000) > 5)

  const xScore = hasXData
    ? (item.x_mu !== undefined && item.x_mu !== null ? item.x_mu : ((item.r_x || 1000) - 1000) / 5)
    : (seededRandom(`${item.id}-x`) - 0.5) * 140
  const yScore = hasYData
    ? (item.y_mu !== undefined && item.y_mu !== null ? item.y_mu : ((item.r_y || 1000) - 1000) / 5)
    : (seededRandom(`${item.id}-y`) - 0.5) * 140

  const xPos = ((xScore + 100) / 200) * 100
  const yPos = 100 - ((yScore + 100) / 200) * 100
  return { xPos, yPos, hasData: hasXData || hasYData }
}

export function normalizeAxisPair(axisLabel: string | undefined, fallbackLow: string, fallbackHigh: string): [string, string] {
  const raw = (axisLabel || '').trim()
  if (!raw) return [fallbackLow, fallbackHigh]

  if (raw.includes('→')) {
    const [low, high] = raw.split('→', 2).map(s => s.trim())
    return [low || fallbackLow, high || fallbackHigh]
  }

  if (raw.includes('->')) {
    const [low, high] = raw.split('->', 2).map(s => s.trim())
    return [low || fallbackLow, high || fallbackHigh]
  }

  return [raw, fallbackHigh]
}

export function getAxisHighValue(label?: string): string {
  if (!label) return 'preferred'
  const [, high] = normalizeAxisPair(label, '', 'preferred')
  return high
}
