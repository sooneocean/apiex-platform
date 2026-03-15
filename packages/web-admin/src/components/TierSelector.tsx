'use client'

import { useState } from 'react'

const TIER_OPTIONS = ['free', 'pro', 'unlimited'] as const
type Tier = (typeof TIER_OPTIONS)[number]

interface TierSelectorProps {
  userId: string
  currentTier: string
  onSave: (tier: string) => Promise<void>
  onCancel: () => void
  disabled?: boolean
}

export default function TierSelector({
  currentTier,
  onSave,
  onCancel,
  disabled,
}: TierSelectorProps) {
  const [value, setValue] = useState<Tier>(
    (TIER_OPTIONS as readonly string[]).includes(currentTier)
      ? (currentTier as Tier)
      : 'free'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as Tier)}
          disabled={saving || disabled}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
          autoFocus
        >
          {TIER_OPTIONS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving || disabled}
          className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '...' : '儲存'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
