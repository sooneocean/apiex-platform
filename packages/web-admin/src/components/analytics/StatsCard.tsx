import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
}

export default function StatsCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  trendLabel,
}: StatsCardProps) {
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  const trendColor =
    trend === 'up'
      ? 'text-green-600'
      : trend === 'down'
      ? 'text-red-600'
      : 'text-gray-400'

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {(subtitle || trendLabel) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {trend && (
            <TrendIcon size={13} className={trendColor} />
          )}
          {trendLabel && (
            <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
          )}
          {subtitle && (
            <span className="text-xs text-gray-400">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}
