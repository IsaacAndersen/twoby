import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, Eye, EyeOff } from "lucide-react"

interface AuthGateProps {
  children: React.ReactNode
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function AuthGate({ children }: AuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [password, setPassword] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [error, setError] = useState<string>("")

  // Check if we have a valid auth token on mount
  useEffect(() => {
    checkExistingAuth()
  }, [])

  async function checkExistingAuth() {
    const token = getCookie('survey_auth_token')
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE}/api/verify-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.authenticated) {
          setIsAuthenticated(true)
        } else {
          // Remove invalid token
          deleteCookie('survey_auth_token')
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      deleteCookie('survey_auth_token')
    }
    
    setIsLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) return

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_BASE}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password.trim() })
      })

      const data = await response.json()

      if (data.success && data.token) {
        // Store token in cookie for 7 days
        setCookie('survey_auth_token', data.token, 7)
        setIsAuthenticated(true)
        setPassword("")
      } else {
        setError(data.message || "Invalid password")
      }
    } catch (error) {
      console.error('Login failed:', error)
      setError("Authentication failed. Please try again.")
    }

    setIsLoading(false)
  }

  function setCookie(name: string, value: string, days: number) {
    const expires = new Date()
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000))
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict;Secure`
  }

  function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null
    }
    return null
  }

  function deleteCookie(name: string) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Access Required</CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Please enter the access code to continue
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Access Code
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter access code"
                    disabled={isLoading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-800">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isLoading || !password.trim()}
                className="w-full"
              >
                {isLoading ? "Verifying..." : "Access Survey"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Access will be remembered for one week on this device
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}