import html2canvas from 'html2canvas'

const blobCache = new Map<string, Blob>()

/**
 * Render an HTML element to a PNG blob.
 * Caches by cacheKey to avoid re-rendering.
 */
export async function renderToBlob(
  element: HTMLElement,
  cacheKey?: string,
): Promise<Blob> {
  if (cacheKey && blobCache.has(cacheKey)) {
    return blobCache.get(cacheKey)!
  }

  const canvas = await html2canvas(element, {
    width: 1080,
    height: 1080,
    scale: 1,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/png',
    )
  })

  if (cacheKey) blobCache.set(cacheKey, blob)
  return blob
}

/**
 * Copy PNG blob to clipboard. Returns true on success.
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ])
    return true
  } catch {
    return false
  }
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

/**
 * Share via Web Share API (Messages, Discord on mobile).
 * Returns true if shared, false if unsupported.
 */
export async function shareViaWebShareAPI(
  blob: Blob,
  title: string,
  url: string,
): Promise<boolean> {
  if (!navigator.share || !navigator.canShare) return false

  const file = new File([blob], `${title}.png`, { type: 'image/png' })
  const shareData = { files: [file], title, url }

  if (!navigator.canShare(shareData)) return false

  try {
    await navigator.share(shareData)
    return true
  } catch {
    return false
  }
}

/**
 * Clear the render cache.
 */
export function clearRenderCache(): void {
  blobCache.clear()
}
