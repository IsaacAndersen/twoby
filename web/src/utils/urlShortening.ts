import { API_BASE } from '@/config'
const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)

// Cache shortened URLs to avoid repeated API calls
const urlCache = new Map<string, string>()

/**
 * Generate a memorable short code from the chart title and ID
 */
function generateMemorableCode(title: string, id: string): string {
  // Clean the title and take first meaningful words
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 2)
  
  // Take first 4 chars of ID
  const shortId = id.substring(0, 6)
  
  // Combine: word1-word2-xxxxxx
  if (words.length === 2) {
    return `${words[0]}-${words[1]}-${shortId}`
  } else if (words.length === 1) {
    return `${words[0]}-${shortId}`
  } else {
    return `chart-${shortId}`
  }
}

/**
 * Create a shortened URL using our backend service
 */
export async function createShortUrl(path: string, params: URLSearchParams, title?: string): Promise<string> {
  const fullUrl = getFullUrl(path, params)
  
  // Check cache first
  if (urlCache.has(fullUrl)) {
    return urlCache.get(fullUrl)!
  }
  
  try {
    // Try to create a short URL through our backend
    const chartId = path.match(/\/[vc]\/([^?]+)/)?.[1] || 'unknown'
    const isVote = path.includes('/v/')
    const memorableCode = title ? generateMemorableCode(title, chartId) : chartId.substring(0, 8)
    
    const response = await fetch(`${API_BASE}/api/short-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        long_url: fullUrl,
        short_code: memorableCode,
        chart_id: chartId,
        is_vote: isVote,
        title: title
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      const shortCode = typeof data.short_code === 'string' ? data.short_code : ''
      const shortUrl = shortCode && !isLocalHost
        ? `${window.location.origin}/s/${shortCode}`
        : data.short_url
      urlCache.set(fullUrl, shortUrl)
      return shortUrl
    }
  } catch (error) {
    console.warn('Backend URL shortening failed, using fallback:', error)
  }
  
  // Fallback: return the original long URL (guaranteed to resolve)
  urlCache.set(fullUrl, fullUrl)
  return fullUrl
}

