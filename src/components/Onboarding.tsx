import { useAppStore } from '../stores/app-store'
import logo from '../assets/logo.png'

export default function Onboarding() {
  const setConfig = useAppStore((s) => s.setConfig)

  const handleStart = () => {
    setConfig({ apiKey: '__local__', tier: 'free' })
  }

  const handleOwnerLogin = () => {
    setConfig({ apiKey: '__owner__', tier: 'pro' })
  }

  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0c] select-none">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <img src={logo} alt="AIOS" className="w-20 h-20 mx-auto mb-5 drop-shadow-[0_0_30px_rgba(249,115,22,0.3)]" />
          <h1 className="text-2xl font-bold text-neutral-100 tracking-tight mb-1">AIOS</h1>
          <p className="text-sm text-neutral-500">AI that controls your computer</p>
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold text-sm hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 active:scale-[0.98]"
        >
          Get started
        </button>

        <p className="text-[11px] text-neutral-600 text-center mt-4 leading-relaxed">
          Uses your existing Claude Code authentication.<br />
          Free tier includes 10,000 credits per day.
        </p>

        <div className="text-center mt-8">
          <button
            onClick={handleOwnerLogin}
            className="text-[11px] text-neutral-700 hover:text-orange-400 transition-colors"
          >
            Owner login
          </button>
        </div>
      </div>
    </div>
  )
}
