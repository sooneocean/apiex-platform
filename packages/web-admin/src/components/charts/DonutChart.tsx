'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import EmptyState from '@/components/analytics/EmptyState'
import type { ModelBreakdownItem } from '@/lib/api'

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#6366f1']

interface DonutChartProps {
  data: ModelBreakdownItem[]
  height?: number
}

export default function DonutChart({ data, height = 220 }: DonutChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState message="尚無 Model 分布資料" />
  }

  const chartData = data.map((item) => ({
    name: item.model_tag,
    value: item.total_tokens,
    percentage: item.percentage,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={3}
          dataKey="value"
          label={(props: PieLabelRenderProps) => {
            const pct = typeof props.percent === 'number' ? (props.percent * 100).toFixed(1) : '0'
            return `${props.name ?? ''} ${pct}%`
          }}
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
          }}
          formatter={(val) => [
            typeof val === 'number' ? val.toLocaleString() + ' tokens' : String(val),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
