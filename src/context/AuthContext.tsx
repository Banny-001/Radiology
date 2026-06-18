import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'
import { DEMO_USERS } from '../data/dummyData'

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const STORAGE_KEY = 'radiography_user_email'

export function AuthProvider({ children }: { children: ReactNode }) {
  // initialise from localStorage so a refresh doesn't log the user out
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return null
      return DEMO_USERS.find(u => u.email === saved) ?? null
    } catch {
      return null
    }
  })

  const login = (email: string, password: string): boolean => {
    if (password !== 'demo1234') return false
    const found = DEMO_USERS.find(u => u.email === email)
    if (!found) return false
    localStorage.setItem(STORAGE_KEY, found.email) // persist
    setUser(found)
    return true
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY) // clear on explicit logout
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}