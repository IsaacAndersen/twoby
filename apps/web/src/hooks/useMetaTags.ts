import { useEffect } from 'react'

interface MetaTags {
  title?: string
  description?: string
  image?: string
  url?: string
}

export function useMetaTags(tags: MetaTags) {
  useEffect(() => {
    // Update title
    if (tags.title) {
      document.title = tags.title
      updateMetaTag('og:title', tags.title)
      updateMetaTag('twitter:title', tags.title)
    }

    // Update description
    if (tags.description) {
      updateMetaTag('description', tags.description)
      updateMetaTag('og:description', tags.description)
      updateMetaTag('twitter:description', tags.description)
    }

    // Update image
    if (tags.image) {
      updateMetaTag('og:image', tags.image)
      updateMetaTag('twitter:image', tags.image)
    }

    // Update URL
    if (tags.url) {
      updateMetaTag('og:url', tags.url)
    }
  }, [tags.title, tags.description, tags.image, tags.url])
}

function updateMetaTag(property: string, content: string) {
  // Try property first (for og: tags)
  let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement
  
  // Fallback to name attribute (for regular meta tags)
  if (!element) {
    element = document.querySelector(`meta[name="${property}"]`) as HTMLMetaElement
  }

  if (element) {
    element.content = content
  } else {
    // Create new meta tag if it doesn't exist
    const meta = document.createElement('meta')
    if (property.startsWith('og:') || property.startsWith('twitter:')) {
      meta.setAttribute('property', property)
    } else {
      meta.setAttribute('name', property)
    }
    meta.content = content
    document.head.appendChild(meta)
  }
}