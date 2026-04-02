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

      const positions = getGridPositions(cluster.length, centerX, centerY, labelWidth, labelHeight)

      cluster.forEach((point, index) => {
        result.push({
          id: point.id,
          x: Math.max(5, Math.min(95, positions[index].x)),
          y: Math.max(5, Math.min(95, positions[index].y)),
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
 * Returns grid positions for small clusters - spread out more aggressively
 */
function getGridPositions(
  count: number,
  centerX: number,
  centerY: number,
  offsetX: number,
  offsetY: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  // Use larger offsets for better separation
  const spreadX = offsetX * 1.5
  const spreadY = offsetY * 2

  if (count === 2) {
    // Side by side with more separation
    positions.push({ x: centerX - spreadX, y: centerY - spreadY * 0.3 })
    positions.push({ x: centerX + spreadX, y: centerY + spreadY * 0.3 })
  } else if (count === 3) {
    // Triangle formation with more spread
    positions.push({ x: centerX, y: centerY - spreadY })
    positions.push({ x: centerX - spreadX, y: centerY + spreadY * 0.5 })
    positions.push({ x: centerX + spreadX, y: centerY + spreadY * 0.5 })
  } else if (count === 4) {
    // 2x2 grid with more separation
    positions.push({ x: centerX - spreadX, y: centerY - spreadY })
    positions.push({ x: centerX + spreadX, y: centerY - spreadY })
    positions.push({ x: centerX - spreadX, y: centerY + spreadY })
    positions.push({ x: centerX + spreadX, y: centerY + spreadY })
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
  const iterations = 100  // More iterations for better convergence
  const minDistance = Math.sqrt(labelWidth * labelWidth + labelHeight * labelHeight) * 0.8  // Minimum separation

  for (let iter = 0; iter < iterations; iter++) {
    const forces = result.map(() => ({ x: 0, y: 0 }))
    const damping = 1 - (iter / iterations) * 0.5  // Reduce movement over time

    // Calculate repulsion forces between ALL points (not just overlapping)
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        let dx = result[j].x - result[i].x
        let dy = result[j].y - result[i].y
        let distance = Math.sqrt(dx * dx + dy * dy)

        // Prevent division by zero - add jitter if points are at same position
        if (distance < 0.1) {
          dx = (Math.random() - 0.5) * 2
          dy = (Math.random() - 0.5) * 2
          distance = Math.sqrt(dx * dx + dy * dy)
        }

        // Apply repulsion if closer than minimum distance
        if (distance < minDistance) {
          // Stronger force when closer, scaled by how much overlap there is
          const overlap = minDistance - distance
          const force = (overlap / minDistance) * 3 * damping
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force

          forces[i].x -= fx
          forces[i].y -= fy
          forces[j].x += fx
          forces[j].y += fy
        }
      }
    }

    // Weak attraction force towards original positions (to preserve general placement)
    for (let i = 0; i < result.length; i++) {
      const dx = result[i].originalX - result[i].x
      const dy = result[i].originalY - result[i].y
      forces[i].x += dx * 0.08 * damping
      forces[i].y += dy * 0.08 * damping
    }

    // Apply forces with bounds checking
    const margin = 8  // Keep items away from edges
    for (let i = 0; i < result.length; i++) {
      result[i].x = Math.max(margin, Math.min(containerWidth - margin, result[i].x + forces[i].x))
      result[i].y = Math.max(margin, Math.min(containerHeight - margin, result[i].y + forces[i].y))
    }
  }

  return result
}

