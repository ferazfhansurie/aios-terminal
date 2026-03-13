import { useAppStore } from '../stores/app-store'

export default function Onboarding() {
  const setConfig = useAppStore((s) => s.setConfig)

  const handleStart = () => {
    setConfig({ apiKey: '__local__', tier: 'free' })
  }

  const handleOwnerLogin = () => {
    setConfig({ apiKey: '__owner__', tier: 'pro' })
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
          <button
            onClick={handleStart}
            className="w-full py-3 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors"
          >
            Get started
          </button>

          <p className="text-xs text-neutral-600 text-center">
            Uses your existing Claude Code authentication.
            <br />
            Free tier: 10,000 credits/day.
          </p>

          <div className="text-center pt-4">
            <button
              onClick={handleOwnerLogin}
              className="text-xs text-neutral-600 hover:text-orange-400 transition-colors"
            >
              Owner login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
