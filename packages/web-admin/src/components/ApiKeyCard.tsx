'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ApiKey } from '@/lib/api'
import ConfirmDialog from './ConfirmDialog'

interface ApiKeyCardProps {
  apiKey: ApiKey
  onRevoke: (id: string) => Promise<void>
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

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-gray-900">{apiKey.name}</span>
          <span className="font-mono text-xs text-gray-400">{apiKey.key_prefix}••••</span>
          <div className="flex items-center gap-2 mt-1">
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
        </div>
        {isActive && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={revoking}
            title="撤銷 API Key"
            className="ml-4 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
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
