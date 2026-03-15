'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { makeAdminWebhooksApi, type WebhookConfig, type Pagination } from '@/lib/api'

const PAGE_LIMIT = 20

export default function AdminWebhooksPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_LIMIT, total: 0 })
  const [page, setPage] = useState(1)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  }, [])

  const loadData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const api = makeAdminWebhooksApi(token)
      const resp = await api.list({ page: p, limit: PAGE_LIMIT })
      setWebhooks(resp.data)
      setPagination(resp.pagination)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load webhooks'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    loadData(page)
  }, [loadData, page])

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Webhooks 總覽</h1>
        <span className="text-sm text-gray-500">共 {pagination.total} 筆設定</span>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">目前無任何 Webhook 設定</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">URL</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Events</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">狀態</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">建立時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {wh.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="truncate block text-xs text-gray-800" title={wh.url}>
                      {wh.url}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map((ev) => (
                        <span
                          key={ev}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        wh.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {wh.is_active ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(wh.created_at).toLocaleString('zh-TW')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-600">
            第 {page} / {totalPages} 頁
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              上一頁
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
