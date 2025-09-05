const API_BASE = import.meta.env.VITE_API_URL || 'https://twobyapi.ike.rs'

interface SuggestionContext {
  title: string
  description?: string
  existingItems?: string[]
  xAxis?: string
  yAxis?: string
  mode?: 'ranking' | 'two_axis' | 'single_axis'
}

export async function generateItemSuggestions(context: SuggestionContext): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/generate-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(context)
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return data.items || []
  } catch (error) {
    console.error('Error generating item suggestions:', error)
    return []
  }
}


export async function generateAxisSuggestions(title: string, items: string[]): Promise<{ xAxis: string, yAxis: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/generate-axes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        items: items.slice(0, 10) // Limit items sent to backend
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return {
      xAxis: data.x_axis || '',
      yAxis: data.y_axis || ''
    }
  } catch (error) {
    console.error('Error generating axis suggestions:', error)
    return { xAxis: '', yAxis: '' }
  }
}

export async function generateChartDescription(title: string, items: string[]): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/generate-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        items: items.slice(0, 10) // Limit items sent to backend
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return data.description || ''
  } catch (error) {
    console.error('Error generating description:', error)
    return ''
  }
}