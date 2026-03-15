'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { apiGet, apiPost, apiDelete } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookConfig {
  id: string
  user_id: string
  url: string
  secret: string | null
  events: string[]
  is_active: boolean
  created_at: string
}

interface WebhookLog {
  id: string
  webhook_config_id: string
  event: string
  payload: Record<string, unknown>
  status_code: number | null
  response_body: string | null
  created_at: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebhookSettingsPage() {
  const [config, setConfig] = useState<WebhookConfig | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form state
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const loadConfig = useCallback(async () => {
    const token = await getToken()
    if (!token) return

    try {
      const res = await apiGet<{ data: WebhookConfig | null }>('/webhooks', token)
      if (res.data) {
        setConfig(res.data)
        setUrl(res.data.url)
        setSecret(res.data.secret ?? '')
      }
    } catch {
      // 無設定時靜默
    }
  }, [getToken])

  const loadLogs = useCallback(async (configId: string) => {
    const token = await getToken()
    if (!token) return

    try {
      const res = await apiGet<{ data: WebhookLog[] }>(`/webhooks/${configId}/logs`, token)
      setLogs(res.data ?? [])
    } catch {
      // 忽略
    }
  }, [getToken])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await loadConfig()
      setLoading(false)
    }
    init()
  }, [loadConfig])

  useEffect(() => {
    if (config) {
      loadLogs(config.id)
    }
  }, [config, loadLogs])

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  async function handleSave() {
    if (!url.trim()) {
      setError('請輸入 Webhook URL')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('未登入')
      const res = await apiPost<{ data: WebhookConfig }>(
        '/webhooks',
        { url: url.trim(), secret: secret.trim() || undefined },
        token
      )
      setConfig(res.data)
      showSuccess('Webhook 設定已儲存')
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!config) return
    if (!confirm('確定要刪除此 Webhook 設定？')) return
    setDeleting(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('未登入')
      await apiDelete(`/webhooks/${config.id}`, token)
      setConfig(null)
      setUrl('')
      setSecret('')
      setLogs([])
      showSuccess('Webhook 設定已刪除')
    } catch (e) {
      setError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setDeleting(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('未登入')
      const res = await apiPost<{ data: WebhookLog }>('/webhooks/test', {}, token)
      showSuccess(`測試推播完成，HTTP ${res.data.status_code ?? '網路錯誤'}`)
      if (config) {
        await loadLogs(config.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '測試失敗')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">載入中...</div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Webhook 通知設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          當 API Key 配額消耗達到 80%、90%、100% 時，系統會推播通知到你設定的 Webhook URL。
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* 設定表單 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-base font-medium text-gray-800 mb-4">Webhook 設定</h2>

        <div className="space-y-4">
          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signing Secret（可選）
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="用於 HMAC-SHA256 簽名驗證"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showSecret ? '隱藏' : '顯示'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              設定後，每次推播的 Header 會附帶 <code className="bg-gray-100 px-1 rounded">X-Webhook-Signature: sha256=...</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '儲存中...' : config ? '更新設定' : '儲存設定'}
          </button>

          {config && (
            <>
              <button
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? '發送中...' : '測試推播'}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? '刪除中...' : '刪除設定'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 推播記錄 */}
      {config && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-gray-800">推播記錄</h2>
            <button
              onClick={() => loadLogs(config.id)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              重新整理
            </button>
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">尚無推播記錄</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.status_code && log.status_code >= 200 && log.status_code < 300
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.status_code ?? '網路錯誤'}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {log.payload?.threshold != null
                          ? `配額告警 ${log.payload.threshold}%`
                          : log.event}
                      </span>
                      {Boolean((log.payload as Record<string, unknown>)?.is_test) && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                          測試
                        </span>
                      )}
                    </div>
                    {log.response_body && (
                      <p className="text-xs text-gray-400 truncate max-w-xs">
                        {log.response_body}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {new Date(log.created_at).toLocaleString('zh-TW', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
