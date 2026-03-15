import { BarChart2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  message?: string
  icon?: LucideIcon
}

export default function EmptyState({
  message = '尚無資料',
  icon: Icon = BarChart2,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Icon size={36} strokeWidth={1.5} className="mb-3 text-gray-300" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}
