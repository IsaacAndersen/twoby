export interface ShareTargets {
  x: string
  reddit: string
  facebook: string
  discord: string
}

export function buildShareTargets(url: string, title: string): ShareTargets {
  const safeTitle = (title || 'Check this out on twoby').trim()
  const encodedTitle = encodeURIComponent(safeTitle)
  const encodedUrl = encodeURIComponent(url)

  return {
    x: `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    discord: `https://discord.com/channels/@me`,
  }
}
