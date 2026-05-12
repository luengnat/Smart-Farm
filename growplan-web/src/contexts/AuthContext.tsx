import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { apiFetch } from '../lib/api'
import type { User, AuthResponse, LoginRequest, RegisterRequest } from '../types/auth'

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (req: LoginRequest) => Promise<void>
  register: (req: RegisterRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem('gp_token')
  })
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    apiFetch<User>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((u) => setUser(u))
      .catch(() => {
        setToken(null)
        sessionStorage.removeItem('gp_token')
      })
      .finally(() => setLoading(false))
  }, [token])

  const login = useCallback(async (req: LoginRequest) => {
    const res = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    setToken(res.token)
    sessionStorage.setItem('gp_token', res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(async (req: RegisterRequest) => {
    const res = await apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    setToken(res.token)
    sessionStorage.setItem('gp_token', res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    sessionStorage.removeItem('gp_token')
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
