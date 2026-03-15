import type { Period } from '@/lib/api'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  disabled?: boolean
}

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
]

export default function PeriodSelector({
  value,
  onChange,
  disabled,
}: PeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-white shadow-sm">
      {PERIODS.map((p) => {
        const active = value === p.value
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md disabled:opacity-40 ${
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
