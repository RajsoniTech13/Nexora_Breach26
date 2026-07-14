import React, { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { api } from '../api/apiClient'

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'signup' && !form.name.trim()) { setError('Full Name is required'); return }
    if (!form.email.trim()) { setError('Email is required'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true)
    try {
      if (mode === 'signup') {
        // Register now returns tokens directly — no need for a separate login call
        const data = await api('/api/v1/auth/register', {
          method: 'POST',
          body: { email: form.email, password: form.password, name: form.name, displayName: form.name }
        })
        localStorage.setItem('breach_token', data.accessToken)
        if (data.refreshToken) localStorage.setItem('breach_refresh', data.refreshToken)
        onAuth(data.accessToken, data.user)
      } else {
        const data = await api('/api/v1/auth/login', {
          method: 'POST',
          body: { email: form.email, password: form.password }
        })
        localStorage.setItem('breach_token', data.accessToken)
        if (data.refreshToken) localStorage.setItem('breach_refresh', data.refreshToken)
        onAuth(data.accessToken, data.user)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true)
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        })

        if (!res.ok) throw new Error('Failed to fetch Google profile')

        const profile = await res.json()

        try {
          const data = await api('/api/v1/auth/oauth/google', {
            method: 'POST',
            body: {
              email: profile.email,
              name: profile.name,
              googleId: profile.sub,
              picture: profile.picture,
              idToken: tokenResponse.access_token
            }
          })
          localStorage.setItem('breach_token', data.accessToken)
          if (data.refreshToken) localStorage.setItem('breach_refresh', data.refreshToken)
          onAuth(data.accessToken, data.user)
        } catch (backendErr) {
          console.warn('Backend Google Auth failed, falling back to client-side visualization:', backendErr)
          const mockUser = {
            id: profile.sub,
            email: profile.email,
            name: profile.name,
            displayName: profile.name,
            picture: profile.picture
          }
          const mockToken = tokenResponse.access_token
          localStorage.setItem('breach_token', mockToken)
          onAuth(mockToken, mockUser)
        }

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google Login Failed')
  })

  function handleGoogleLogin() {
    googleLogin()
  }

  return (
    <main className="min-h-[100dvh] flex items-start md:items-center justify-center p-4 py-6 md:py-4 overflow-y-auto">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-0 rounded-3xl shadow-2xl border border-slate-200 bg-white">
        {/* Left panel — branding */}
        <div className="flex flex-col justify-between bg-gradient-to-br from-emerald-500 via-emerald-600 to-cyan-700 p-6 md:p-10 text-white rounded-t-3xl md:rounded-t-none md:rounded-l-3xl">
          <div>
            <div className="flex items-center gap-2 mb-4 md:mb-8">
              <div className="h-9 w-9 rounded-xl bg-white/25 flex items-center justify-center text-white font-bold text-sm">B</div>
              <span className="text-xl font-bold tracking-tight">Nexora</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold leading-tight">Smart expense splitting for every group</h1>
            <p className="mt-2 md:mt-4 text-emerald-100 text-sm md:text-base leading-relaxed">
              Track bills, run transparent ledgers, and settle debts in the fewest possible transactions.
            </p>
            <div className="mt-4 md:mt-8 space-y-2 md:space-y-3">
              {['Equal, percentage & custom splits', 'Optimized debt settlement', 'Real-time group ledger'].map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs md:text-sm">
                  <span className="h-5 w-5 rounded-full bg-white/25 flex items-center justify-center text-xs flex-shrink-0">✓</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 md:mt-8 rounded-2xl bg-white/15 border border-white/20 p-3 md:p-4 text-sm space-y-1">
            <p className="font-semibold text-white/90">Demo Credentials</p>
            <p className="text-emerald-100">📧 priya@breach.app</p>
            <p className="text-emerald-100">🔑 Priya@1234</p>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="p-6 md:p-10 flex flex-col justify-center rounded-b-3xl md:rounded-b-none md:rounded-r-3xl">
          {/* Tab toggle */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-5 md:mb-6">
            {['login', 'signup'].map((m) => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3 md:space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input value={form.name} onChange={set('name')} placeholder="Priya Sharma"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 md:py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="priya@breach.app"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 md:py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 md:py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition" />
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2.5 md:py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors">
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="my-3 md:my-4 flex items-center gap-3">
            <hr className="flex-1 border-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          <button onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-2.5 md:py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-3 md:mt-4 text-center text-xs text-slate-400">
            By continuing you agree to our Terms of Service & Privacy Policy.
          </p>
        </div>
      </div>
    </main>
  )
}
