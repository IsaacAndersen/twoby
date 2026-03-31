interface Item {
  id: string
  label: string
}

interface PairHistory {
  [key: string]: number // Track how many times each item has been shown
}


/**
 * Implements a smarter pair selection algorithm that ensures:
 * 1. Each item gets roughly equal coverage
 * 2. Pairs are not repeated too frequently
 * 3. Early items are prioritized if they haven't been seen much
 */
export class SmartPairSelector {
  private itemHistory: PairHistory = {}
  private pairHistory: Map<string, number> = new Map()
  private sessionKey: string

  constructor(sessionKey: string) {
    this.sessionKey = sessionKey
    this.loadHistory()
  }

  private loadHistory() {
    try {
      const saved = sessionStorage.getItem(`pair_history_${this.sessionKey}`)
      if (saved) {
        const data = JSON.parse(saved)
        this.itemHistory = data.itemHistory || {}
        this.pairHistory = new Map(data.pairHistory || [])
      }
    } catch (error) {
      console.error('Failed to load pair history:', error)
    }
  }

  private saveHistory() {
    try {
      const data = {
        itemHistory: this.itemHistory,
        pairHistory: Array.from(this.pairHistory.entries())
      }
      sessionStorage.setItem(`pair_history_${this.sessionKey}`, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save pair history:', error)
    }
  }

  private getPairKey(itemA: string, itemB: string): string {
    return [itemA, itemB].sort().join('|')
  }

  private getItemShowCount(itemId: string): number {
    return this.itemHistory[itemId] || 0
  }

  private getPairShowCount(itemA: string, itemB: string): number {
    return this.pairHistory.get(this.getPairKey(itemA, itemB)) || 0
  }

  /**
   * Select the best pair based on coverage logic
   */
  selectPair(items: Item[]): [Item, Item] | null {
    if (items.length < 2) return null

    // Calculate priority scores for each item
    // Lower scores = higher priority (less shown)
    const itemPriorities = items.map(item => ({
      item,
      showCount: this.getItemShowCount(item.id),
      priority: this.getItemShowCount(item.id)
    }))

    // Sort by priority (least shown first)
    itemPriorities.sort((a, b) => a.priority - b.priority)

    // Find the best pair considering both item coverage and pair freshness
    let bestPair: [Item, Item] | null = null
    let bestScore = Infinity

    // Try combinations, favoring less-shown items
    for (let i = 0; i < Math.min(items.length, 6); i++) {
      for (let j = i + 1; j < Math.min(items.length, 8); j++) {
        const itemA = itemPriorities[i].item
        const itemB = itemPriorities[j].item
        
        const itemACount = this.getItemShowCount(itemA.id)
        const itemBCount = this.getItemShowCount(itemB.id)
        const pairCount = this.getPairShowCount(itemA.id, itemB.id)
        
        // Score calculation:
        // - Lower item show counts = better
        // - Lower pair count = better
        // - Slight bonus for extremely underrepresented items
        const avgItemCount = (itemACount + itemBCount) / 2
        const pairPenalty = pairCount * 3 // Heavily penalize repeated pairs
        const underrepresentationBonus = Math.max(0, 3 - Math.min(itemACount, itemBCount))
        
        const score = avgItemCount + pairPenalty - underrepresentationBonus

        if (score < bestScore) {
          bestScore = score
          bestPair = [itemA, itemB]
        }
      }
    }

    // If we couldn't find a good pair, fall back to random selection from least shown
    if (!bestPair) {
      const leastShown = itemPriorities.slice(0, Math.min(4, items.length))
      const shuffled = leastShown.sort(() => Math.random() - 0.5)
      if (shuffled.length >= 2) {
        bestPair = [shuffled[0].item, shuffled[1].item]
      }
    }

    return bestPair
  }

  /**
   * Record that a pair was shown
   */
  recordPairShown(itemA: Item, itemB: Item) {
    // Update item history
    this.itemHistory[itemA.id] = (this.itemHistory[itemA.id] || 0) + 1
    this.itemHistory[itemB.id] = (this.itemHistory[itemB.id] || 0) + 1

    // Update pair history
    const pairKey = this.getPairKey(itemA.id, itemB.id)
    this.pairHistory.set(pairKey, (this.pairHistory.get(pairKey) || 0) + 1)

    this.saveHistory()
  }

}
