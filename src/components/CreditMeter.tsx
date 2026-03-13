import { useAppStore } from '../stores/app-store'

export default function CreditMeter() {
  const { creditsUsed, creditLimit, config } = useAppStore()
  const remaining = Math.max(0, creditLimit - creditsUsed)
  const pct = creditLimit > 0 ? (creditsUsed / creditLimit) * 100 : 0
  const isPro = config.tier === 'pro'

  if (isPro) {
    return (
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="px-1.5 py-0.5 rounded accent-bg-15 accent-text font-medium">PRO</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'accent-bg'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-neutral-500 tabular-nums">
        {Math.round(remaining).toLocaleString()} left
      </span>
    </div>
  )
}
