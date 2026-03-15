'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import EmptyState from '@/components/analytics/EmptyState'
import type { LatencyPoint } from '@/lib/api'

/** apex-smart -> 藍色系 (p50/p95/p99)，apex-cheap -> 橘色系 */
const MODEL_PALETTES: Record<string, [string, string, string]> = {
  'apex-smart': ['#3b82f6', '#1d4ed8', '#1e40af'],
  'apex-cheap': ['#f97316', '#ea580c', '#c2410c'],
}
const FALLBACK_PALETTES: [string, string, string][] = [
  ['#8b5cf6', '#7c3aed', '#6d28d9'],
  ['#10b981', '#059669', '#047857'],
]

function formatDate(timestamp: string, granularity: 'hour' | 'day'): string {
  const d = new Date(timestamp)
  if (granularity === 'hour') {
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:00`
  }
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

interface LatencyLineChartProps {
  data: LatencyPoint[]
  granularity?: 'hour' | 'day'
  height?: number
  modelTags?: string[]
}

export default function LatencyLineChart({
  data,
  granularity = 'day',
  height = 220,
  modelTags,
}: LatencyLineChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState message="尚無延遲資料" />
  }

  const tags =
    modelTags ??
    Array.from(
      new Set(
        data.flatMap((p) => Object.keys(p).filter((k) => k !== 'timestamp'))
      )
    )

  // 攤平資料
  const flat = data.map((point) => {
    const row: Record<string, unknown> = {
      label: formatDate(point.timestamp as string, granularity),
    }
    for (const tag of tags) {
      const val = point[tag]
      if (val && typeof val === 'object') {
        const latency = val as { p50: number; p95: number; p99: number }
        row[`${tag}.p50`] = latency.p50
        row[`${tag}.p95`] = latency.p95
        row[`${tag}.p99`] = latency.p99
      }
    }
    return row
  })

  // 建立 line series 設定
  const lines: { key: string; name: string; color: string; dash?: string }[] =
    []
  tags.forEach((tag, i) => {
    const palette =
      MODEL_PALETTES[tag] ?? FALLBACK_PALETTES[i % FALLBACK_PALETTES.length]
    lines.push(
      { key: `${tag}.p50`, name: `${tag} p50`, color: palette[0] },
      { key: `${tag}.p95`, name: `${tag} p95`, color: palette[1], dash: '4 2' },
      { key: `${tag}.p99`, name: `${tag} p99`, color: palette[2], dash: '2 2' }
    )
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={flat} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v: number) => `${v}ms`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
          }}
          formatter={(val) => [typeof val === 'number' ? `${val}ms` : String(val)]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={l.color}
            strokeWidth={1.5}
            dot={false}
            strokeDasharray={l.dash}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
