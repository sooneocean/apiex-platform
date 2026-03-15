'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Pencil, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { makeRatesApi, type ModelRate, type ModelRateInsert } from '@/lib/api'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  type: 'success' | 'error'
  message: string
  onClose: () => void
}

function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm ${
        type === 'success'
          ? 'bg-white border-green-200 text-green-700'
          : 'bg-white border-red-200 text-red-700'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 size={14} />
      ) : (
        <AlertCircle size={14} />
      )}
      {message}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100">
        <X size={12} />
      </button>
    </div>
  )
}

// ─── Rate Form Modal ──────────────────────────────────────────────────────────

interface RateFormProps {
  initial?: ModelRate
  onSave: (data: ModelRateInsert) => Promise<void>
  onClose: () => void
}

function RateForm({ initial, onSave, onClose }: RateFormProps) {
  const [modelTag, setModelTag] = useState(initial?.model_tag ?? '')
  const [inputRate, setInputRate] = useState(
    initial ? String(initial.input_rate_per_1k) : ''
  )
  const [outputRate, setOutputRate] = useState(
    initial ? String(initial.output_rate_per_1k) : ''
  )
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial ? initial.effective_from.slice(0, 16) : ''
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!modelTag.trim()) {
      setFormError('Model Tag 為必填')
      return
    }
    const inp = parseFloat(inputRate)
    const out = parseFloat(outputRate)
    if (isNaN(inp) || inp < 0) {
      setFormError('Input Rate 必須為 >= 0 的數字')
      return
    }
    if (isNaN(out) || out < 0) {
      setFormError('Output Rate 必須為 >= 0 的數字')
      return
    }

    setSaving(true)
    try {
      const payload: ModelRateInsert = {
        model_tag: modelTag.trim(),
        input_rate_per_1k: inp,
        output_rate_per_1k: out,
      }
      if (effectiveFrom) {
        payload.effective_from = new Date(effectiveFrom).toISOString()
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Model Tag <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={modelTag}
          onChange={(e) => setModelTag(e.target.value)}
          disabled={!!initial}
          placeholder="e.g. apex-smart"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Input Rate ($/1K tokens) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={inputRate}
            onChange={(e) => setInputRate(e.target.value)}
            placeholder="0.100000"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Output Rate ($/1K tokens) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={outputRate}
            onChange={(e) => setOutputRate(e.target.value)}
            placeholder="0.200000"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          生效時間（選填，預設 now）
        </label>
        <input
          type="datetime-local"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      {formError && (
        <p className="text-sm text-red-600">{formError}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </form>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ToastState {
  type: 'success' | 'error'
  message: string
}

export default function AdminRatesPage() {
  const router = useRouter()
  const [rates, setRates] = useState<ModelRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ModelRate | null>(null)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const loadRates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const api = makeRatesApi(token)
      const res = await api.list()
      setRates(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadRates()
  }, [loadRates])

  async function handleCreate(data: ModelRateInsert) {
    const token = await getToken()
    const api = makeRatesApi(token)
    await api.create(data)
    setToast({ type: 'success', message: '費率已新增' })
    await loadRates()
  }

  async function handleUpdate(id: string, data: ModelRateInsert) {
    const token = await getToken()
    const api = makeRatesApi(token)
    await api.update(id, data)
    setToast({ type: 'success', message: '費率已更新' })
    await loadRates()
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">費率設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            管理各 Model 的 token 計費費率
          </p>
        </div>
        <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <Dialog.Trigger asChild>
            <button className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
              <Plus size={14} />
              新增費率
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <Dialog.Title className="text-base font-semibold text-gray-900">
                  新增費率
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <RateForm onSave={handleCreate} onClose={() => setCreateOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Rates Table */}
      {loading ? (
        <LoadingSkeleton variant="table" />
      ) : rates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          尚無費率設定，請點擊「新增費率」開始設定
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left px-4 py-3 font-medium">Model Tag</th>
                <th className="text-right px-4 py-3 font-medium">
                  Input Rate ($/1K)
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  Output Rate ($/1K)
                </th>
                <th className="text-left px-4 py-3 font-medium">生效時間 (UTC)</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr
                  key={rate.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {rate.model_tag}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600">
                    ${rate.input_rate_per_1k.toFixed(6)}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600">
                    ${rate.output_rate_per_1k.toFixed(6)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(rate.effective_from).toLocaleString('zh-TW', {
                      timeZone: 'UTC',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    UTC
                  </td>
                  <td className="text-right px-4 py-3">
                    <button
                      onClick={() => setEditTarget(rate)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      <Pencil size={12} />
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog.Root
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-base font-semibold text-gray-900">
                編輯費率
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            {editTarget && (
              <RateForm
                initial={editTarget}
                onSave={(data) => handleUpdate(editTarget.id, data)}
                onClose={() => setEditTarget(null)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
