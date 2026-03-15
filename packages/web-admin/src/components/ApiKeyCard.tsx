'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ApiKey } from '@/lib/api'
import ConfirmDialog from './ConfirmDialog'

interface ApiKeyCardProps {
  apiKey: ApiKey
  onRevoke: (id: string) => Promise<void>
}

/** Format cents integer to USD string, e.g. 12300 → "$123.00" */
function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function ApiKeyCard({ apiKey, onRevoke }: ApiKeyCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)

  async function handleRevoke() {
    setRevoking(true)
    try {
      await onRevoke(apiKey.id)
    } finally {
      setRevoking(false)
      setConfirmOpen(false)
    }
  }

  const isActive = apiKey.status === 'active'

  const spentUsd = apiKey.spent_usd ?? 0
  const spendLimitUsd = apiKey.spend_limit_usd ?? -1
  const isUnlimited = spendLimitUsd === -1
  const isOverLimit = !isUnlimited && spentUsd >= spendLimitUsd
  const usageRatio = (!isUnlimited && spendLimitUsd > 0) ? spentUsd / spendLimitUsd : 0
  const isWarning = !isUnlimited && usageRatio >= 0.8 && usageRatio < 1.0

  // Determine spend badge color
  let spendColor = 'text-gray-500'
  if (isOverLimit) spendColor = 'text-red-600 font-semibold'
  else if (isWarning) spendColor = 'text-amber-600 font-semibold'

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900">{apiKey.name}</span>
          <span className="font-mono text-xs text-gray-400">{apiKey.key_prefix}••••</span>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {apiKey.status}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(apiKey.created_at).toLocaleDateString('zh-TW')}
            </span>
          </div>
          {/* Spend display */}
          <div className={`text-xs mt-1 ${spendColor}`}>
            {isUnlimited ? (
              <span>花費 {formatUsd(spentUsd)} / 無限制</span>
            ) : isOverLimit ? (
              <span>花費 {formatUsd(spentUsd)} / {formatUsd(spendLimitUsd)} <span className="text-red-500">(已超限)</span></span>
            ) : (
              <span>花費 {formatUsd(spentUsd)} / {formatUsd(spendLimitUsd)}</span>
            )}
          </div>
          {/* Progress bar (only shown when there's a limit) */}
          {!isUnlimited && spendLimitUsd > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
              <div
                className={`h-1 rounded-full transition-all ${
                  isOverLimit ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-blue-400'
                }`}
                style={{ width: `${Math.min(usageRatio * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
        {isActive && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={revoking}
            title="撤銷 API Key"
            className="ml-4 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="撤銷 API Key"
        description={`確定要撤銷「${apiKey.name}」(${apiKey.key_prefix}••••) 嗎？此操作無法復原。`}
        confirmLabel={revoking ? '撤銷中...' : '撤銷'}
        destructive
        onConfirm={handleRevoke}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
