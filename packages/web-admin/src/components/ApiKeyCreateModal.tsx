'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import CopyableTextField from './CopyableTextField'

interface ApiKeyCreateModalProps {
  open: boolean
  onCreate: (name: string) => Promise<{ key: string }>
  onClose: () => void
}

export default function ApiKeyCreateModal({
  open,
  onCreate,
  onClose,
}: ApiKeyCreateModalProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const result = await onCreate(name.trim())
      setNewKey(result.key)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗')
    } finally {
      setCreating(false)
    }
  }

  function handleClose() {
    setName('')
    setError(null)
    setNewKey(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={newKey ? undefined : handleClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {newKey ? 'API Key 已建立' : '建立 API Key'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {newKey ? (
            /* One-time display of the plaintext key */
            <div className="space-y-4">
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                請立即複製此 Key，關閉後將無法再次查看。
              </p>
              <CopyableTextField value={newKey} label="API Key" monospace />
              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                >
                  我已複製，關閉
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="key-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Key 名稱
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production App"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  disabled={creating}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={creating}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? '建立中...' : '建立'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
