'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import EmptyState from '@/components/analytics/EmptyState'
import type { TimeseriesPoint } from '@/lib/api'

const MODEL_COLORS: Record<string, string> = {
  'apex-smart': '#3b82f6',
  'apex-cheap': '#10b981',
  default0: '#8b5cf6',
  default1: '#f59e0b',
  default2: '#ef4444',
  default3: '#6366f1',
}

function getColor(modelTag: string, index: number): string {
  return MODEL_COLORS[modelTag] ?? MODEL_COLORS[`default${index % 4}`] ?? '#6b7280'
}

function formatDate(timestamp: string, granularity: 'hour' | 'day'): string {
  const d = new Date(timestamp)
  if (granularity === 'hour') {
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:00`
  }
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

interface TimeseriesAreaChartProps {
  data: TimeseriesPoint[]
  granularity?: 'hour' | 'day'
  height?: number
  /** 要顯示的 model tags；若不傳則自動偵測 */
  modelTags?: string[]
}

export default function TimeseriesAreaChart({
  data,
  granularity = 'day',
  height = 220,
  modelTags,
}: TimeseriesAreaChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState message="開始使用 API 後將顯示用量趨勢" />
  }

  // 自動偵測 model tags（排除 timestamp）
  const tags =
    modelTags ??
    Array.from(
      new Set(
        data.flatMap((point) =>
          Object.keys(point).filter((k) => k !== 'timestamp')
        )
      )
    )

  // 攤平資料：把 series[].['apex-smart'].total_tokens 轉成 series[]['apex-smart']
  const flat = data.map((point) => {
    const row: Record<string, unknown> = {
      label: formatDate(point.timestamp as string, granularity),
    }
    for (const tag of tags) {
      const val = point[tag]
      if (val && typeof val === 'object' && 'total_tokens' in val) {
        row[tag] = (val as { total_tokens: number }).total_tokens
      } else {
        row[tag] = 0
      }
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={flat} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {tags.map((tag, i) => (
            <linearGradient
              key={tag}
              id={`gradient-${tag}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={getColor(tag, i)}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={getColor(tag, i)}
                stopOpacity={0.05}
              />
            </linearGradient>
          ))}
        </defs>
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
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {tags.map((tag, i) => (
          <Area
            key={tag}
            type="monotone"
            dataKey={tag}
            name={tag}
            stroke={getColor(tag, i)}
            fill={`url(#gradient-${tag})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
