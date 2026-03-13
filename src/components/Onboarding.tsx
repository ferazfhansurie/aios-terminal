import { useState } from 'react'
import { useAppStore } from '../stores/app-store'

export default function Onboarding() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setConfig = useAppStore((s) => s.setConfig)

  const handleSubmit = async () => {
    const key = apiKey.trim()
    if (!key.startsWith('sk-ant-')) {
      setError('Invalid API key. It should start with sk-ant-')
      return
    }
    setLoading(true)
    setError('')
    setConfig({ apiKey: key, tier: 'free' })
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0c]">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold text-neutral-100 mb-2">AIOS</h1>
          <p className="text-sm text-neutral-500">AI that controls your computer</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1.5">Anthropic API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="sk-ant-..."
              className="w-full bg-[#141416] text-neutral-100 rounded-lg px-4 py-3 border border-white/[0.06] focus:border-orange-500/50 focus:outline-none placeholder:text-neutral-600 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading || !apiKey.trim()}
            className="w-full py-3 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Validating...' : 'Get started'}
          </button>

          <div className="text-center">
            <button className="text-xs text-neutral-500 hover:text-orange-400 transition-colors">
              Have a Pro account? Login here
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-600 text-center mt-6">
          Free tier: 10,000 credits/day. Your key stays on your device.
        </p>
      </div>
    </div>
  )
}
