import React, { useState, useEffect } from 'react'
import { api } from './api/apiClient'
import AuthScreen from './screens/AuthScreen'
import AppShell from './components/layout/AppShell'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('breach_token'))
  const [user, setUser]   = useState(null)
  const [booting, setBooting] = useState(true)

  // Capture OAuth token from URL (?token=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      localStorage.setItem('breach_token', urlToken)
      setToken(urlToken)
      window.history.replaceState({}, '', '/')
    }
  }, [])

  // Validate stored token and fetch current user
  useEffect(() => {
    if (!token) { setBooting(false); return }
    api('/api/v1/users/me', { token })
      .then((d) => setUser(d.user))
      .catch(() => {
        localStorage.removeItem('breach_token')
        localStorage.removeItem('breach_refresh')
        setToken(null)
      })
      .finally(() => setBooting(false))
  }, [token])

  function handleAuth(t, u) {
    setToken(t)
    setUser(u)
  }

  function handleLogout() {
    api('/api/v1/auth/logout', { method: 'POST', token }).catch(() => {})
    localStorage.removeItem('breach_token')
    localStorage.removeItem('breach_refresh')
    setToken(null)
    setUser(null)
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500 mb-4" />
          <p className="text-sm text-slate-500">Loading Breach…</p>
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return <AuthScreen onAuth={handleAuth} />
  }

  return <AppShell token={token} user={user} onLogout={handleLogout} />
}
