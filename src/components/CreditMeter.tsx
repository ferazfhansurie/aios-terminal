import { useAppStore } from '../stores/app-store'

export default function CreditMeter() {
  const { creditsUsed, creditLimit, config } = useAppStore()
  const remaining = Math.max(0, creditLimit - creditsUsed)
  const pct = creditLimit > 0 ? (creditsUsed / creditLimit) * 100 : 0
  const isPro = config.tier === 'pro'

  if (isPro) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="text-green-400">Pro</span>
        <span>Unlimited</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-neutral-500">
        {remaining.toLocaleString()} credits left
      </span>
    </div>
  )
}
