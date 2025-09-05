interface Point {
  id: string
  x: number
  y: number
  label: string
  originalX: number
  originalY: number
}


/**
 * Detects and resolves collisions between labels in a 2D space
 * Returns adjusted positions that minimize overlaps while staying close to original positions
 */
export function resolveCollisions(
  items: Array<{ id: string; x: number; y: number; label: string }>,
  containerWidth: number = 100,
  containerHeight: number = 100,
  labelWidth: number = 15,  // Approximate label width as % of container
  labelHeight: number = 5    // Approximate label height as % of container
): Array<{ id: string; x: number; y: number; clustered?: boolean; clusterMembers?: string[] }> {
  
  if (items.length === 0) return []
  
  // Convert to working points with original positions preserved
  const points: Point[] = items.map(item => ({
    ...item,
    originalX: item.x,
    originalY: item.y
  }))
  
  // Group nearby points into clusters
  const clusters = createClusters(points, labelWidth, labelHeight)
  
  // Process each cluster
  const result: Array<{ id: string; x: number; y: number; clustered?: boolean; clusterMembers?: string[] }> = []
  
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      // Single item, no collision
      result.push({
        id: cluster[0].id,
        x: cluster[0].x,
        y: cluster[0].y
      })
    } else if (cluster.length <= 4) {
      // Small cluster - arrange in a grid pattern around center
      const centerX = cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length
      const centerY = cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length
      
      const positions = getGridPositions(cluster.length, centerX, centerY, labelWidth * 0.8, labelHeight * 0.8)
      
      cluster.forEach((point, index) => {
        result.push({
          id: point.id,
          x: positions[index].x,
          y: positions[index].y,
          clustered: true,
          clusterMembers: cluster.map(p => p.label)
        })
      })
    } else {
      // Large cluster - use force-directed approach
      const adjusted = forceDirectedLayout(cluster, labelWidth, labelHeight, containerWidth, containerHeight)
      
      adjusted.forEach(point => {
        result.push({
          id: point.id,
          x: point.x,
          y: point.y,
          clustered: true,
          clusterMembers: cluster.map(p => p.label)
        })
      })
    }
  }
  
  return result
}

/**
 * Groups nearby points into clusters based on collision detection
 */
function createClusters(points: Point[], labelWidth: number, labelHeight: number): Point[][] {
  const clusters: Point[][] = []
  const processed = new Set<string>()
  
  for (const point of points) {
    if (processed.has(point.id)) continue
    
    const cluster: Point[] = [point]
    processed.add(point.id)
    
    // Find all points that collide with this cluster
    let changed = true
    while (changed) {
      changed = false
      for (const other of points) {
        if (processed.has(other.id)) continue
        
        // Check if this point collides with any point in the cluster
        for (const clusterPoint of cluster) {
          if (detectCollision(clusterPoint, other, labelWidth, labelHeight)) {
            cluster.push(other)
            processed.add(other.id)
            changed = true
            break
          }
        }
      }
    }
    
    clusters.push(cluster)
  }
  
  return clusters
}

/**
 * Detects if two points' labels would overlap
 */
function detectCollision(a: Point, b: Point, labelWidth: number, labelHeight: number): boolean {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  
  return dx < labelWidth && dy < labelHeight
}

/**
 * Returns grid positions for small clusters
 */
function getGridPositions(
  count: number,
  centerX: number,
  centerY: number,
  offsetX: number,
  offsetY: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  
  if (count === 2) {
    // Side by side
    positions.push({ x: centerX - offsetX / 2, y: centerY })
    positions.push({ x: centerX + offsetX / 2, y: centerY })
  } else if (count === 3) {
    // Triangle formation
    positions.push({ x: centerX, y: centerY - offsetY / 2 })
    positions.push({ x: centerX - offsetX / 2, y: centerY + offsetY / 2 })
    positions.push({ x: centerX + offsetX / 2, y: centerY + offsetY / 2 })
  } else if (count === 4) {
    // 2x2 grid
    positions.push({ x: centerX - offsetX / 2, y: centerY - offsetY / 2 })
    positions.push({ x: centerX + offsetX / 2, y: centerY - offsetY / 2 })
    positions.push({ x: centerX - offsetX / 2, y: centerY + offsetY / 2 })
    positions.push({ x: centerX + offsetX / 2, y: centerY + offsetY / 2 })
  }
  
  return positions
}

/**
 * Uses a simple force-directed approach to separate overlapping points
 */
function forceDirectedLayout(
  points: Point[],
  labelWidth: number,
  labelHeight: number,
  containerWidth: number,
  containerHeight: number
): Point[] {
  const result = points.map(p => ({ ...p }))
  const iterations = 50
  const repulsionForce = 0.5
  const attractionForce = 0.1
  
  for (let iter = 0; iter < iterations; iter++) {
    const forces = result.map(() => ({ x: 0, y: 0 }))
    
    // Calculate repulsion forces between overlapping points
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x
        const dy = result[j].y - result[i].y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < Math.sqrt(labelWidth * labelWidth + labelHeight * labelHeight)) {
          const force = repulsionForce / (distance + 0.1)
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force
          
          forces[i].x -= fx
          forces[i].y -= fy
          forces[j].x += fx
          forces[j].y += fy
        }
      }
    }
    
    // Add attraction force towards original positions
    for (let i = 0; i < result.length; i++) {
      const dx = result[i].originalX - result[i].x
      const dy = result[i].originalY - result[i].y
      forces[i].x += dx * attractionForce
      forces[i].y += dy * attractionForce
    }
    
    // Apply forces with bounds checking
    for (let i = 0; i < result.length; i++) {
      result[i].x = Math.max(labelWidth / 2, Math.min(containerWidth - labelWidth / 2, result[i].x + forces[i].x))
      result[i].y = Math.max(labelHeight / 2, Math.min(containerHeight - labelHeight / 2, result[i].y + forces[i].y))
    }
  }
  
  return result
}

/**
 * Alternative: Simple offset strategy for dense areas
 * Arranges overlapping items in a spiral pattern
 */
export function spiralLayout(
  items: Array<{ id: string; x: number; y: number; label: string }>,
  centerX: number,
  centerY: number,
  radius: number = 5
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const angleStep = (2 * Math.PI) / items.length
  
  items.forEach((_, index) => {
    const angle = index * angleStep
    const r = radius * (1 + index * 0.1) // Slightly increasing radius
    positions.push({
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r
    })
  })
  
  return positions
}