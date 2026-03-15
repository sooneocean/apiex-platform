'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { makeAdminApi, UsageLog, Pagination } from '@/lib/api'
import UsageLogsTable from '@/components/UsageLogsTable'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const PER_PAGE = 20

export default function LogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelTagFilter, setModelTagFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      const adminApi = makeAdminApi(token)
      const result = await adminApi.getUsageLogs({
        model_tag: debouncedFilter || undefined,
        page,
        per_page: PER_PAGE,
      })
      setLogs(result.data)
      setPagination(result.pagination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleFilterChange(value: string) {
    setModelTagFilter(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedFilter(value)
      setPage(1)
    }, 300)
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setDebouncedFilter(modelTagFilter)
    setPage(1)
  }

  const totalPages = pagination ? Math.ceil(pagination.total / PER_PAGE) : 1

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Usage Logs</h1>
        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          重新整理
        </button>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="flex items-center gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Model Tag</label>
          <input
            type="text"
            value={modelTagFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder="e.g. gpt-4o"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>
        <div className="self-end">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            套用
          </button>
        </div>
        {modelTagFilter && (
          <div className="self-end">
            <button
              type="button"
              onClick={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current)
                setModelTagFilter('')
                setDebouncedFilter('')
                setPage(1)
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              清除
            </button>
          </div>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="table" />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <UsageLogsTable logs={logs} loading={false} />
        </div>
      )}

      {/* Pagination */}
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
