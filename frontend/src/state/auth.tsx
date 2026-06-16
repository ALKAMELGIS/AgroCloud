import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { readCurrentUser, startSession } from '../lib/auth'
import type { CurrentUser } from '../lib/auth'

type AuthContextValue = {
  user: CurrentUser | null
  login: (user: Partial<CurrentUser>) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => readCurrentUser())

  useEffect(() => {
    const refresh = () => setUser(readCurrentUser())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: (next) => startSession(next),
      logout: () => startSession(null),
    }),
    [user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>.')
  return ctx
}

