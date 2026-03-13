import { useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { connectWebSocket } from '../lib/web-bridge'
import logo from '../assets/logo.png'

type Mode = 'login' | 'register'

export default function Onboarding() {
  const isWeb = !!(window as any).__AIOS_WEB__
  const setConfig = useAppStore((s) => s.setConfig)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields')
      return
    }

    if (mode === 'register' && !name.trim()) {
      setError('Please enter your name')
      return
    }

    setLoading(true)

    try {
      const aios = (window as any).aios

      if (mode === 'register') {
        if (aios?.registerUser) {
          const result = await aios.registerUser({ email: email.trim(), password, name: name.trim() })
          if (!result.success) {
            setError(result.error || 'Registration failed')
            return
          }
        }
        // Connect WebSocket in web mode after successful auth
        if (isWeb) connectWebSocket()
        setConfig({
          apiKey: `user:${email.trim()}`,
          tier: 'free',
          appearance: 'dark',
          justRegistered: true,
        })
      } else {
        if (aios?.loginUser) {
          const result = await aios.loginUser({ email: email.trim(), password })
          if (!result.success) {
            setError(result.error || 'Invalid email or password')
            return
          }
          // Connect WebSocket in web mode after successful auth
          if (isWeb) connectWebSocket()
          setConfig({
            apiKey: `user:${email.trim()}`,
            tier: result.tier || 'free',
            appearance: 'dark',
          })
        } else {
          setError('Authentication service unavailable')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0c] select-none px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <img src={logo} alt="AIOS" className="w-20 h-20 mx-auto mb-5 accent-glow" />
          <h1 className="text-2xl font-bold text-neutral-100 tracking-tight mb-1">AIOS</h1>
          <p className="text-sm text-neutral-500">AI Operating System by Adletic</p>
        </div>

        {/* Login / Register tabs */}
        <div className="flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5 mb-5">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                mode === m
                  ? 'accent-bg-15 accent-text shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl bg-[#141416] border border-white/[0.06] text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none accent-ring"
              autoComplete="name"
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-4 py-3 rounded-xl bg-[#141416] border border-white/[0.06] text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none accent-ring"
            autoComplete="email"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-xl bg-[#141416] border border-white/[0.06] text-neutral-100 text-sm placeholder:text-neutral-600 focus:outline-none accent-ring"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

          {error && (
            <p className="text-xs text-red-400 px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl accent-bg text-white font-semibold text-sm hover:brightness-110 transition-all accent-shadow active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="text-[11px] text-neutral-600 text-center mt-4 leading-relaxed">
            Free tier includes 500 credits per day.<br />
            Upgrade anytime for unlimited access.
          </p>
        )}

        <p className="text-[10px] text-neutral-700 text-center mt-6">
          Powered by Adletic Agency
        </p>
      </div>
    </div>
  )
}
