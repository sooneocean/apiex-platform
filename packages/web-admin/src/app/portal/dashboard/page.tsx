'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  makeAnalyticsApi,
  makeKeysApi,
  type Period,
  type TimeseriesData,
  type ModelBreakdownData,
  type LatencyData,
  type BillingSummary,
  type ApiKey,
} from '@/lib/api'
import StatsCard from '@/components/analytics/StatsCard'
import PeriodSelector from '@/components/analytics/PeriodSelector'
import KeySelector from '@/components/analytics/KeySelector'
import EmptyState from '@/components/analytics/EmptyState'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'
const TimeseriesAreaChart = dynamic(
  () => import('@/components/charts/TimeseriesAreaChart'),
  { loading: () => <LoadingSkeleton variant="chart" />, ssr: false }
)
const LatencyLineChart = dynamic(
  () => import('@/components/charts/LatencyLineChart'),
  { loading: () => <LoadingSkeleton variant="chart" />, ssr: false }
)
const DonutChart = dynamic(
  () => import('@/components/charts/DonutChart'),
  { loading: () => <LoadingSkeleton variant="chart" />, ssr: false }
)

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

export default function PortalDashboardPage() {
  const router = useRouter()

  const [period, setPeriod] = useState<Period>('7d')
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])

  const [timeseries, setTimeseries] = useState<TimeseriesData | null>(null)
  const [breakdown, setBreakdown] = useState<ModelBreakdownData | null>(null)
  const [latency, setLatency] = useState<LatencyData | null>(null)
  const [billing, setBilling] = useState<BillingSummary | null>(null)

  const [loading, setLoading] = useState(true)
  const [keysLoading, setKeysLoading] = useState(true)
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

  // 載入 API Keys 清單（只需一次）
  const loadKeys = useCallback(async () => {
    setKeysLoading(true)
    try {
      const token = await getToken()
      const keysApi = makeKeysApi(token)
      const res = await keysApi.list()
      setKeys(res.data)
    } catch {
      // 無法載入 key 列表不阻斷主流程
    } finally {
      setKeysLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 載入 Analytics 資料
  const loadAnalytics = useCallback(
    async (p: Period, keyId: string | null) => {
      // 取消前一個請求
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
        const api = makeAnalyticsApi(token)

        const params = { period: p, key_id: keyId ?? undefined }

        const [tsRes, bdRes, ltRes, blRes] = await Promise.all([
          api.getTimeseries(params, signal),
          api.getModelBreakdown(params, signal),
          api.getLatency(params, signal),
          api.getBilling({ period: p }, signal),
        ])

        if (signal.aborted) return

        setTimeseries(tsRes.data)
        setBreakdown(bdRes.data)
        setLatency(ltRes.data)
        setBilling(blRes.data)
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        setError(e instanceof Error ? e.message : '資料載入失敗')
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  )

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  useEffect(() => {
    loadAnalytics(period, selectedKeyId)
    return () => {
      abortRef.current?.abort()
    }
  }, [period, selectedKeyId, loadAnalytics])

  const isEmpty =
    !loading &&
    !error &&
    timeseries?.series.length === 0 &&
    breakdown?.breakdown.length === 0

  const hasData = timeseries && breakdown && latency && billing

  const totalRequests = timeseries?.totals.total_requests ?? 0
  const totalTokens = timeseries?.totals.total_tokens ?? 0

  // 計算平均延遲（取所有 model 最新時間點的 p50 平均）
  const avgLatency = useMemo(() => {
    if (!latency?.series.length) return null
    const last = latency.series[latency.series.length - 1]
    const vals = Object.keys(last)
      .filter((k) => k !== 'timestamp')
      .map((k) => {
        const v = last[k]
        return typeof v === 'object' && v !== null && 'p50' in v
          ? (v as { p50: number }).p50
          : null
      })
      .filter((v): v is number => v !== null)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }, [latency])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">用量 Dashboard</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector
            value={period}
            onChange={(p) => setPeriod(p)}
            disabled={loading}
          />
          {!keysLoading && keys.length > 0 && (
            <KeySelector
              keys={keys}
              value={selectedKeyId}
              onSelect={(id) => setSelectedKeyId(id)}
              disabled={loading}
            />
          )}
          <button
            onClick={() => loadAnalytics(period, selectedKeyId)}
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
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsCard
            title="總請求數"
            value={totalRequests.toLocaleString()}
            subtitle={`${period} 期間`}
          />
          <StatsCard
            title="總 Tokens"
            value={totalTokens >= 1000000
              ? `${(totalTokens / 1000000).toFixed(2)}M`
              : totalTokens >= 1000
              ? `${(totalTokens / 1000).toFixed(1)}K`
              : String(totalTokens)}
            subtitle={`${period} 期間`}
          />
          <StatsCard
            title="平均延遲"
            value={avgLatency !== null ? avgLatency : 'N/A'}
            unit={avgLatency !== null ? 'ms' : ''}
            subtitle="p50（最近期）"
          />
          <StatsCard
            title="配額剩餘"
            value={
              billing?.quota.is_unlimited
                ? '無限制'
                : billing?.quota.total_quota_tokens !== undefined
                ? `${(billing.quota.total_quota_tokens / 1000000).toFixed(1)}M`
                : 'N/A'
            }
            unit={billing?.quota.is_unlimited ? '' : 'tokens'}
            subtitle={
              billing?.quota.estimated_days_remaining !== null &&
              billing?.quota.estimated_days_remaining !== undefined
                ? `約 ${billing.quota.estimated_days_remaining.toFixed(0)} 天`
                : undefined
            }
          />
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <EmptyState message="開始使用 API 後將顯示數據" />
      )}

      {/* Timeseries Chart */}
      {loading ? (
        <LoadingSkeleton variant="chart" />
      ) : hasData ? (
        <SectionCard title="用量趨勢">
          <TimeseriesAreaChart
            data={timeseries.series}
            granularity={timeseries.granularity}
            height={220}
          />
        </SectionCard>
      ) : null}

      {/* Model Breakdown + Latency */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LoadingSkeleton variant="chart" />
          <LoadingSkeleton variant="chart" />
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionCard title="Model 分布">
            <DonutChart data={breakdown.breakdown} height={220} />
          </SectionCard>
          <SectionCard title="延遲分析">
            <LatencyLineChart
              data={latency.series}
              granularity={latency.granularity}
              height={220}
            />
          </SectionCard>
        </div>
      ) : null}

      {/* Billing */}
      {loading ? (
        <LoadingSkeleton variant="table" />
      ) : billing ? (
        <SectionCard title="帳單摘要">
          {billing.cost === null ? (
            <p className="text-sm text-gray-500">費率未設定，請聯絡管理員</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gray-900">
                  ${billing.cost.total_usd.toFixed(4)}
                </span>
                <span className="text-sm text-gray-400">USD（{period} 期間）</span>
              </div>
              {billing.cost.breakdown.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500">
                        <th className="text-left py-2 pr-4 font-medium">Model</th>
                        <th className="text-right py-2 pr-4 font-medium">Input tokens</th>
                        <th className="text-right py-2 pr-4 font-medium">Output tokens</th>
                        <th className="text-right py-2 font-medium">費用 (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billing.cost.breakdown.map((item) => (
                        <tr key={item.model_tag} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-4 text-gray-700">{item.model_tag}</td>
                          <td className="text-right py-2 pr-4 text-gray-600">
                            {item.prompt_tokens.toLocaleString()}
                          </td>
                          <td className="text-right py-2 pr-4 text-gray-600">
                            {item.completion_tokens.toLocaleString()}
                          </td>
                          <td className="text-right py-2 font-medium text-gray-800">
                            ${item.total_cost_usd.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Recent Topups */}
          {billing.recent_topups.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">最近充值記錄</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="text-left py-1.5 pr-4 font-medium">金額 (USD)</th>
                    <th className="text-right py-1.5 pr-4 font-medium">Tokens</th>
                    <th className="text-right py-1.5 font-medium">時間</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.recent_topups.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-4 text-gray-700">
                        ${(t.amount_usd / 100).toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 pr-4 text-gray-600">
                        {t.tokens_granted.toLocaleString()}
                      </td>
                      <td className="text-right py-1.5 text-gray-400 text-xs">
                        {new Date(t.created_at).toLocaleDateString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}
