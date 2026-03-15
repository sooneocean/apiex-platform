'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  makeAdminAnalyticsApi,
  type Period,
  type PlatformOverviewData,
  type LatencyData,
  type TopUsersData,
} from '@/lib/api'
import StatsCard from '@/components/analytics/StatsCard'
import PeriodSelector from '@/components/analytics/PeriodSelector'
import EmptyState from '@/components/analytics/EmptyState'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'
import TimeseriesAreaChart from '@/components/charts/TimeseriesAreaChart'
import LatencyLineChart from '@/components/charts/LatencyLineChart'

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={14} className="shrink-0" />
      {message}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const router = useRouter()

  const [period, setPeriod] = useState<Period>('7d')
  const [overview, setOverview] = useState<PlatformOverviewData | null>(null)
  const [latency, setLatency] = useState<LatencyData | null>(null)
  const [topUsers, setTopUsers] = useState<TopUsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const loadAnalytics = useCallback(async (p: Period) => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    const signal = controller.signal

    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      const api = makeAdminAnalyticsApi(token)

      const [ovRes, ltRes, tuRes] = await Promise.all([
        api.getOverview({ period: p }, signal),
        api.getLatency({ period: p }, signal),
        api.getTopUsers({ period: p, limit: 10 }, signal),
      ])

      if (signal.aborted) return

      setOverview(ovRes.data)
      setLatency(ltRes.data)
      setTopUsers(tuRes.data)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError(e instanceof Error ? e.message : '資料載入失敗')
    } finally {
      if (!signal.aborted) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadAnalytics(period)
    return () => {
      abortRef.current?.abort()
    }
  }, [period, loadAnalytics])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">平台 Analytics</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector
            value={period}
            onChange={(p) => setPeriod(p)}
            disabled={loading}
          />
          <button
            onClick={() => loadAnalytics(period)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Stats Cards */}
      {loading ? (
        <LoadingSkeleton variant="cards" />
      ) : overview ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsCard
            title="全平台 Tokens"
            value={overview.total_tokens >= 1000000
              ? `${(overview.total_tokens / 1000000).toFixed(2)}M`
              : overview.total_tokens >= 1000
              ? `${(overview.total_tokens / 1000).toFixed(1)}K`
              : String(overview.total_tokens)}
            subtitle={`${period} 期間`}
          />
          <StatsCard
            title="總請求數"
            value={overview.total_requests.toLocaleString()}
            subtitle={`${period} 期間`}
          />
          <StatsCard
            title="活躍用戶"
            value={overview.active_users.toLocaleString()}
            unit="人"
            subtitle={`${period} 期間`}
          />
          <StatsCard
            title="平均延遲"
            value={overview.avg_latency_ms}
            unit="ms"
          />
        </div>
      ) : !error ? (
        <EmptyState message="尚無平台資料" />
      ) : null}

      {/* Timeseries Chart */}
      {loading ? (
        <LoadingSkeleton variant="chart" />
      ) : overview && overview.series.length > 0 ? (
        <SectionCard title="全平台用量趨勢">
          <TimeseriesAreaChart
            data={overview.series}
            height={220}
          />
        </SectionCard>
      ) : null}

      {/* Top Users Table */}
      {loading ? (
        <LoadingSkeleton variant="table" />
      ) : topUsers && topUsers.rankings.length > 0 ? (
        <SectionCard title="Top 10 用戶">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left py-2 pr-4 font-medium">#</th>
                  <th className="text-left py-2 pr-4 font-medium">Email</th>
                  <th className="text-right py-2 pr-4 font-medium">Tokens</th>
                  <th className="text-right py-2 pr-4 font-medium">請求數</th>
                  <th className="text-right py-2 font-medium">費用 (USD)</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.rankings.map((user, idx) => (
                  <tr
                    key={user.user_id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-4 text-gray-400">{idx + 1}</td>
                    <td className="py-2 pr-4 text-gray-700">{user.email}</td>
                    <td className="text-right py-2 pr-4 text-gray-600">
                      {user.total_tokens.toLocaleString()}
                    </td>
                    <td className="text-right py-2 pr-4 text-gray-600">
                      {user.total_requests.toLocaleString()}
                    </td>
                    <td className="text-right py-2 font-medium text-gray-800">
                      {user.total_cost_usd !== null
                        ? `$${user.total_cost_usd.toFixed(4)}`
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {/* Latency Chart */}
      {loading ? (
        <LoadingSkeleton variant="chart" />
      ) : latency && latency.series.length > 0 ? (
        <SectionCard title="延遲分析（按 Model）">
          <LatencyLineChart
            data={latency.series}
            granularity={latency.granularity}
            height={260}
          />
        </SectionCard>
      ) : null}
    </div>
  )
}
