/**
 * In-house URL shortening utilities
 * Creates memorable short codes and manages them through our backend
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

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
      const shortUrl = data.short_url
      urlCache.set(fullUrl, shortUrl)
      return shortUrl
    }
  } catch (error) {
    console.warn('Backend URL shortening failed, using fallback:', error)
  }
  
  // Fallback: Create a client-side short format
  const chartId = path.match(/\/[vc]\/([^?]+)/)?.[1] || 'unknown'
  const baseUrl = window.location.origin
  
  const memorableCode = title ? generateMemorableCode(title, chartId) : chartId.substring(0, 8)
  const shortUrl = `${baseUrl}/s/${memorableCode}`
  
  urlCache.set(fullUrl, shortUrl)
  return shortUrl
}

/**
 * Get the display version of a URL (for showing to users)
 */
export function getDisplayUrl(url: string): string {
  // Remove protocol and www
  return url
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\?.*$/, '') // Remove query params for display
    .replace(/\/$/, '') // Remove trailing slash
}

/**
 * Get the full URL for a given path and params
 */
export function getFullUrl(path: string, params: URLSearchParams): string {
  return `${window.location.origin}${path}${params.toString() ? '?' + params.toString() : ''}`
}