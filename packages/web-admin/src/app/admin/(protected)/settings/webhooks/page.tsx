'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  makeWebhooksApi,
  NOTIFICATION_EVENTS,
  type WebhookConfig,
  type WebhookLog,
  type NotificationEventType,
} from '@/lib/api'

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
      <span>{type === 'success' ? '✓' : '✕'}</span>
      {message}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 text-xs">
        ✕
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebhooksSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [config, setConfig] = useState<WebhookConfig | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])

  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<NotificationEventType[]>(
    NOTIFICATION_EVENTS.map((e) => e.value)
  )

  const [testResult, setTestResult] = useState<{ status: number | null; ok: boolean } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
  }

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.get()
      const existing = resp.data

      if (existing) {
        setConfig(existing)
        setUrl(existing.url)
        setSelectedEvents(existing.events as NotificationEventType[])

        // Load logs for this config
        const logsResp = await api.logs(existing.id, 20)
        setLogs(logsResp.data)
      } else {
        setConfig(null)
        setLogs([])
      }
    } catch (err) {
      console.error('Failed to load webhook config:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async () => {
    if (!url.trim()) {
      showToast('error', '請填入 Webhook URL')
      return
    }
    try {
      new URL(url)
    } catch {
      showToast('error', 'URL 格式無效，請輸入 http:// 或 https:// 開頭的網址')
      return
    }

    setSaving(true)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.upsert({
        url: url.trim(),
        ...(secret.trim() ? { secret: secret.trim() } : {}),
        events: selectedEvents,
      })
      setConfig(resp.data)
      showToast('success', 'Webhook 設定已儲存')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗'
      showToast('error', msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!config) return
    if (!window.confirm('確定要刪除 Webhook 設定？此操作無法復原。')) return

    setDeleting(true)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      await api.remove(config.id)
      setConfig(null)
      setUrl('')
      setSecret('')
      setSelectedEvents(NOTIFICATION_EVENTS.map((e) => e.value))
      setLogs([])
      showToast('success', 'Webhook 設定已刪除')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '刪除失敗'
      showToast('error', msg)
    } finally {
      setDeleting(false)
    }
  }

  const handleTest = async () => {
    if (!config) {
      showToast('error', '請先儲存 Webhook 設定後再測試')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.test()
      setTestResult({ status: resp.data.status_code, ok: (resp.data.status_code ?? 0) >= 200 && (resp.data.status_code ?? 0) < 300 })
      showToast('success', `測試推播已發送，狀態碼：${resp.data.status_code ?? '無回應'}`)
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '測試失敗'
      setTestResult({ status: null, ok: false })
      showToast('error', msg)
    } finally {
      setTesting(false)
    }
  }

  const toggleEvent = (event: NotificationEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Webhook 設定</h1>

      {/* Config Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5 mb-6">
        {/* URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Webhook URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Secret */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Secret（可選，HMAC-SHA256 簽名用）
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="留空表示不使用簽名驗證"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Events */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">訂閱事件</label>
          <div className="space-y-2">
            {NOTIFICATION_EVENTS.map((e) => (
              <label key={e.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(e.value)}
                  onChange={() => toggleEvent(e.value)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{e.label}</span>
                <span className="text-xs text-gray-400 font-mono">{e.value}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '儲存中...' : '儲存設定'}
          </button>

          {config && (
            <>
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {testing ? '測試中...' : '測試推播'}
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                {deleting ? '刪除中...' : '刪除設定'}
              </button>
            </>
          )}
        </div>

        {testResult && (
          <div
            className={`text-sm px-3 py-2 rounded-md ${
              testResult.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            測試結果：HTTP {testResult.status ?? '無回應'}
            {testResult.ok ? ' — 成功' : ' — 失敗'}
          </div>
        )}
      </div>

      {/* Logs */}
      {config && (
        <div>
          <h2 className="text-base font-medium text-gray-900 mb-3">推播記錄（最近 20 筆）</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">尚無推播記錄</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">事件</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">狀態碼</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{log.event}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            log.status_code && log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.status_code ?? '無回應'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
