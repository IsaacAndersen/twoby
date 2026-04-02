import type { Item } from '@/types'
import { seededRandom } from '@/utils/chart'

export interface PlacedItem extends Item {
  xPos: number
  yPos: number
  hasData: boolean
  confidence: number
}

/** Extract score and data-presence flags for both axes from an item */
function extractScores(item: Item): {
  hasXData: boolean
  hasYData: boolean
  xScore: number
  yScore: number
} {
  const hasXData =
    (item.x_mu !== undefined && item.x_mu !== null) ||
    (item.r_x !== undefined && Math.abs(item.r_x - 1000) > 5)
  const hasYData =
    (item.y_mu !== undefined && item.y_mu !== null) ||
    (item.r_y !== undefined && Math.abs(item.r_y - 1000) > 5)

  const xScore = hasXData
    ? (item.x_mu !== undefined && item.x_mu !== null
        ? item.x_mu
        : ((item.r_x || 1000) - 1000) / 5)
    : 0
  const yScore = hasYData
    ? (item.y_mu !== undefined && item.y_mu !== null
        ? item.y_mu
        : ((item.r_y || 1000) - 1000) / 5)
    : 0

  return { hasXData, hasYData, xScore, yScore }
}

const QUANTILE_MIN = 5
const QUANTILE_MAX = 95
const QUANTILE_RANGE = QUANTILE_MAX - QUANTILE_MIN

/** Map a 0-1 quantile fraction to the padded position range (5-95) */
function quantileToPos(fraction: number): number {
  return QUANTILE_MIN + fraction * QUANTILE_RANGE
}

/** Raw score (-100 to +100) mapped to position (0-100), then clamped to 5-95 */
function rawScoreToPos(score: number): number {
  const raw = ((score + 100) / 200) * 100
  return Math.max(QUANTILE_MIN, Math.min(QUANTILE_MAX, raw))
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Quadrant center for a position (0-100): returns 25 or 75 depending on which half */
function quadrantCenter(pos: number): number {
  return pos < 50 ? 25 : 75
}

/**
 * Place items using quantile spreading and confidence-based gravity.
 *
 * Items with vote data are sorted by score and assigned quantile positions so
 * they spread across the full range (5-95%). Items without vote data get
 * seeded-random placement that avoids the center crosshair. Low-confidence
 * items are pulled toward their quadrant center.
 */
export function placeItems(items: Item[]): PlacedItem[] {
  if (items.length === 0) return []

  // Separate items into those with and without vote data, per axis
  const scores = items.map(item => ({ item, ...extractScores(item) }))

  // Build sorted indices for X and Y axes (voted items only)
  const xVoted = scores
    .map((s, i) => ({ i, score: s.xScore, hasData: s.hasXData }))
    .filter(s => s.hasData)
    .sort((a, b) => a.score - b.score)

  const yVoted = scores
    .map((s, i) => ({ i, score: s.yScore, hasData: s.hasYData }))
    .filter(s => s.hasData)
    .sort((a, b) => a.score - b.score)

  // Assign quantile positions for each axis
  const xQuantilePos = new Map<number, number>()
  const yQuantilePos = new Map<number, number>()

  function assignQuantiles(
    sorted: Array<{ i: number; score: number }>,
    posMap: Map<number, number>
  ) {
    const n = sorted.length
    if (n <= 3) {
      // Fall back to raw score mapping
      for (const { i, score } of sorted) {
        posMap.set(i, rawScoreToPos(score))
      }
    } else {
      // Quantile spreading: evenly space items across 0-1, then map to 5-95
      for (let rank = 0; rank < n; rank++) {
        const fraction = n === 1 ? 0.5 : rank / (n - 1)
        posMap.set(sorted[rank].i, quantileToPos(fraction))
      }
    }
  }

  assignQuantiles(xVoted, xQuantilePos)
  assignQuantiles(yVoted, yQuantilePos)

  // Build result
  const result: PlacedItem[] = []

  for (let i = 0; i < items.length; i++) {
    const { item, hasXData, hasYData } = scores[i]
    const hasData = hasXData || hasYData

    // Compute n-based confidence
    const maxN = Math.max(item.n_x ?? 0, item.n_y ?? 0)
    const confidence = Math.min(1, maxN / 8)

    let xPos: number
    let yPos: number

    if (hasXData && xQuantilePos.has(i)) {
      xPos = xQuantilePos.get(i)!
    } else {
      // Seeded random, avoiding center crosshair (45-55%)
      const raw = seededRandom(`${item.id}-x`)
      // Map 0-1 to avoid the 45-55 band: split into two halves
      xPos = raw < 0.5
        ? QUANTILE_MIN + raw * 2 * 40          // 5 to 45
        : 55 + (raw - 0.5) * 2 * (QUANTILE_MAX - 55) // 55 to 95
    }

    if (hasYData && yQuantilePos.has(i)) {
      // Y axis: higher score = higher on chart (lower yPos value)
      yPos = 100 - yQuantilePos.get(i)!
    } else {
      const raw = seededRandom(`${item.id}-y`)
      yPos = raw < 0.5
        ? QUANTILE_MIN + raw * 2 * 40
        : 55 + (raw - 0.5) * 2 * (QUANTILE_MAX - 55)
    }

    // Confidence-based gravity: pull low-confidence voted items toward quadrant center
    if (hasData && confidence < 1) {
      const qcX = quadrantCenter(xPos)
      const qcY = quadrantCenter(yPos)
      xPos = lerp(qcX, xPos, confidence)
      yPos = lerp(qcY, yPos, confidence)
    }

    result.push({ ...item, xPos, yPos, hasData, confidence })
  }

  return result
}
