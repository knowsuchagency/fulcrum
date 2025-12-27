import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'

interface AuthContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  authRequired: boolean
  showLoginModal: boolean
  setShowLoginModal: (show: boolean) => void
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/check')
      if (res.ok) {
        const data = await res.json()
        setAuthRequired(data.authRequired)
        setIsAuthenticated(data.authenticated)
        if (data.authRequired && !data.authenticated) {
          setShowLoginModal(true)
        }
      }
    } catch {
      // Server unreachable, assume no auth required
      setAuthRequired(false)
      setIsAuthenticated(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Listen for auth-required events from fetch utilities
  useEffect(() => {
    const handleAuthRequired = () => {
      if (authRequired) {
        setIsAuthenticated(false)
        setShowLoginModal(true)
      }
    }

    window.addEventListener('vibora:auth-required', handleAuthRequired)
    return () => window.removeEventListener('vibora:auth-required', handleAuthRequired)
  }, [authRequired])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Login failed')
    }

    setIsAuthenticated(true)
    setShowLoginModal(false)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setIsAuthenticated(false)
    setShowLoginModal(true)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      authRequired,
      showLoginModal,
      setShowLoginModal,
      login,
      logout,
    }),
    [isAuthenticated, isLoading, authRequired, showLoginModal, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
