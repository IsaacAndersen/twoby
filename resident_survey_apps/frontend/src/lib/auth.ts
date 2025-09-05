export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null
  }
  return null
}

export function getAuthToken(): string | null {
  return getCookie('survey_auth_token')
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken()
  if (token) {
    return {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    }
  }
  return {
    'Content-Type': 'application/json'
  }
}