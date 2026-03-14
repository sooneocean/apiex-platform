'use client'

import { useState } from 'react'

interface QuotaEditorProps {
  userId: string
  currentQuota: number
  onSave: (quota: number) => Promise<void>
  onCancel: () => void
}

export default function QuotaEditor({
  currentQuota,
  onSave,
  onCancel,
}: QuotaEditorProps) {
  const [value, setValue] = useState(String(currentQuota))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || parsed < 0) {
      setError('請輸入有效的正整數')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-400"
          disabled={saving}
          autoFocus
        />
        <button
          onClick={handleSave}
          disabled={saving}
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
