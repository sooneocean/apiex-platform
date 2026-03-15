'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Pencil, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { makeRoutesApi, type RouteConfig, type RouteConfigCreate } from '@/lib/api'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  type: 'success' | 'error' | 'warning'
  message: string
  onClose: () => void
}

function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const colorMap = {
    success: 'bg-white border-green-200 text-green-700',
    error: 'bg-white border-red-200 text-red-700',
    warning: 'bg-white border-yellow-300 text-yellow-700',
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm ${colorMap[type]}`}
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

// ─── Route Form ───────────────────────────────────────────────────────────────

interface RouteFormProps {
  initial?: RouteConfig
  onSave: (data: RouteConfigCreate) => Promise<void>
  onClose: () => void
}

function RouteForm({ initial, onSave, onClose }: RouteFormProps) {
  const [tag, setTag] = useState(initial?.tag ?? '')
  const [provider, setProvider] = useState(initial?.upstream_provider ?? '')
  const [model, setModel] = useState(initial?.upstream_model ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.upstream_base_url ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!tag.trim()) { setFormError('Tag 為必填'); return }
    if (!provider.trim()) { setFormError('Provider 為必填'); return }
    if (!model.trim()) { setFormError('Model 為必填'); return }
    if (!baseUrl.trim()) { setFormError('Base URL 為必填'); return }

    setSaving(true)
    try {
      await onSave({
        tag: tag.trim(),
        upstream_provider: provider.trim(),
        upstream_model: model.trim(),
        upstream_base_url: baseUrl.trim(),
      })
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tag <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          disabled={!!initial}
          placeholder="e.g. apex-smart"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Provider <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="e.g. anthropic"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Upstream Model <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. claude-opus-4-6"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Base URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.anthropic.com"
          className={inputClass}
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

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-gray-800' : 'bg-gray-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ToastState {
  type: 'success' | 'error' | 'warning'
  message: string
}

export default function AdminRoutesPage() {
  const router = useRouter()
  const [routes, setRoutes] = useState<RouteConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RouteConfig | null>(null)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const api = makeRoutesApi(getToken)

  const loadRoutes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.list()
      setRoutes(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadRoutes()
  }, [loadRoutes])

  async function handleCreate(data: RouteConfigCreate) {
    await api.create(data)
    setToast({ type: 'success', message: '路由已新增' })
    await loadRoutes()
  }

  async function handleUpdate(id: string, data: RouteConfigCreate) {
    await api.update(id, data)
    setToast({ type: 'success', message: '路由已更新' })
    await loadRoutes()
  }

  async function handleToggle(id: string) {
    setToggling(id)
    try {
      const res = await api.toggle(id)
      if (res.warning === 'last_active_route') {
        setToast({ type: 'warning', message: '警告：這是此 tag 的最後一個 active 路由，停用後 proxy 可能回 503' })
      } else {
        const isNowActive = res.data.is_active
        setToast({ type: 'success', message: isNowActive ? '路由已啟用' : '路由已停用' })
      }
      await loadRoutes()
    } catch (e) {
      setToast({ type: 'error', message: e instanceof Error ? e.message : '切換失敗，請重試' })
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">路由設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            管理 route_config 模型路由（含 inactive）
          </p>
        </div>
        <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
          <Dialog.Trigger asChild>
            <button className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
              <Plus size={14} />
              新增路由
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <Dialog.Title className="text-base font-semibold text-gray-900">
                  新增路由
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <RouteForm onSave={handleCreate} onClose={() => setCreateOpen(false)} />
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

      {/* Routes Table */}
      {loading ? (
        <LoadingSkeleton variant="table" />
      ) : routes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          尚無路由設定，請點擊「新增路由」開始設定
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left px-4 py-3 font-medium">Tag</th>
                <th className="text-left px-4 py-3 font-medium">Provider</th>
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-left px-4 py-3 font-medium">Base URL</th>
                <th className="text-center px-4 py-3 font-medium">Active</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr
                  key={route.id}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${
                    route.is_active ? 'hover:bg-gray-50' : 'opacity-50 hover:bg-gray-50'
                  }`}
                >
                  <td className={`px-4 py-3 font-medium ${route.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                    {route.tag}
                  </td>
                  <td className={`px-4 py-3 ${route.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
                    {route.upstream_provider}
                  </td>
                  <td className={`px-4 py-3 ${route.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
                    {route.upstream_model}
                  </td>
                  <td className={`px-4 py-3 text-xs truncate max-w-[200px] ${route.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                    {route.upstream_base_url}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ToggleSwitch
                      checked={route.is_active}
                      onChange={() => handleToggle(route.id)}
                      disabled={toggling === route.id}
                    />
                  </td>
                  <td className="text-right px-4 py-3">
                    <button
                      onClick={() => setEditTarget(route)}
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
                編輯路由
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            {editTarget && (
              <RouteForm
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
