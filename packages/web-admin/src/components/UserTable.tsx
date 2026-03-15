'use client'

import { useState } from 'react'
import { AdminUser } from '@/lib/api'
import QuotaEditor from './QuotaEditor'
import TierSelector from './TierSelector'

interface UserTableProps {
  users: AdminUser[]
  onQuotaUpdate: (userId: string, quota: number) => Promise<void>
  onTierUpdate: (userId: string, tier: string) => Promise<void>
}

const TIER_BADGE_STYLE: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  pro: 'bg-blue-100 text-blue-700',
  unlimited: 'bg-green-100 text-green-700',
}

export default function UserTable({ users, onQuotaUpdate, onTierUpdate }: UserTableProps) {
  const [editingQuotaUserId, setEditingQuotaUserId] = useState<string | null>(null)
  const [editingTierUserId, setEditingTierUserId] = useState<string | null>(null)

  function formatTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Keys</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Used Tokens</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Quota</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">Tier</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-900">{user.email}</td>
              <td className="px-4 py-3 text-right text-gray-700">{user.key_count}</td>
              <td className="px-4 py-3 text-right text-gray-700">
                {formatTokens(user.total_tokens_used)}
              </td>
              <td className="px-4 py-3 text-right">
                {editingQuotaUserId === user.id ? (
                  <QuotaEditor
                    userId={user.id}
                    currentQuota={user.quota_tokens}
                    onSave={async (quota) => {
                      await onQuotaUpdate(user.id, quota)
                      setEditingQuotaUserId(null)
                    }}
                    onCancel={() => setEditingQuotaUserId(null)}
                  />
                ) : (
                  <span className="text-gray-700">{formatTokens(user.quota_tokens)}</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {editingTierUserId === user.id ? (
                  <TierSelector
                    userId={user.id}
                    currentTier={user.rate_limit_tier ?? 'free'}
                    onSave={async (tier) => {
                      await onTierUpdate(user.id, tier)
                      setEditingTierUserId(null)
                    }}
                    onCancel={() => setEditingTierUserId(null)}
                  />
                ) : (
                  <button
                    onClick={() => setEditingTierUserId(user.id)}
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize hover:opacity-80 transition-opacity ${
                      TIER_BADGE_STYLE[user.rate_limit_tier ?? 'free'] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {user.rate_limit_tier ?? 'free'}
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(user.created_at).toLocaleDateString('zh-TW')}
              </td>
              <td className="px-4 py-3 text-right">
                {editingQuotaUserId !== user.id && (
                  <button
                    onClick={() => setEditingQuotaUserId(user.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit Quota
                  </button>
                )}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
