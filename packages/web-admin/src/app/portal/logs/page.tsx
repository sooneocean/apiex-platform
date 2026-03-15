'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { makeTopupApi, TopupLog, Pagination } from '@/lib/api'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

const PER_PAGE = 20

const STATUS_LABEL: Record<string, string> = {
  completed: '完成',
  pending: '處理中',
  failed: '失敗',
}

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PortalLogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<TopupLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const topupApi = makeTopupApi(token)
      const result = await topupApi.getLogs(page, PER_PAGE)
      setLogs(result.data)
      setPagination(result.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = pagination ? Math.ceil(pagination.total / PER_PAGE) : 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">充值記錄</h1>
        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          重新整理
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            載入中...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            尚無充值記錄
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  日期
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  金額
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Tokens
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  狀態
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                    {formatUsd(log.amount_usd)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {log.tokens_granted.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        STATUS_CLASS[log.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {STATUS_LABEL[log.status] ?? log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            共 {pagination.total} 筆，第 {page} / {totalPages} 頁
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} />
              上一頁
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              下一頁
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
