'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { makeTopupApi } from '@/lib/api'

type PollingStatus = 'polling' | 'completed' | 'timeout' | 'error'

const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 30000

export default function TopupSuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [status, setStatus] = useState<PollingStatus>('polling')
  const [tokensGranted, setTokensGranted] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!sessionId) {
      setStatus('error')
      setError('缺少 session_id 參數')
      return
    }

    async function poll() {
      const elapsed = Date.now() - startTimeRef.current
      if (elapsed >= TIMEOUT_MS) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setStatus('timeout')
        return
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) return

        const topupApi = makeTopupApi(sessionData.session.access_token)
        const result = await topupApi.getStatus(sessionId!)
        if (result.data.status === 'completed') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setTokensGranted(result.data.tokens_granted)
          setStatus('completed')
        }
      } catch (e) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setStatus('error')
        setError(e instanceof Error ? e.message : '查詢付款狀態失敗')
      }
    }

    // 立即執行一次，再設 interval
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      {status === 'polling' && (
        <div>
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-700 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">處理中</h1>
          <p className="text-sm text-gray-500">正在確認付款結果，請稍候...</p>
        </div>
      )}

      {status === 'completed' && (
        <div>
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">付款成功</h1>
          {tokensGranted !== null && (
            <p className="text-sm text-gray-600 mb-6">
              已成功充值 <span className="font-semibold text-gray-900">{tokensGranted.toLocaleString()}</span> tokens
            </p>
          )}
          <Link
            href="/portal/logs"
            className="inline-block rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            查看充值記錄
          </Link>
        </div>
      )}

      {status === 'timeout' && (
        <div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">處理中，請稍後刷新查看</h1>
          <p className="text-sm text-gray-500 mb-6">
            付款已收到，但處理需要一些時間。若長時間未更新，請聯繫支援。
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              重新整理
            </button>
            <Link
              href="/portal/logs"
              className="inline-block rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              查看記錄
            </Link>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">發生錯誤</h1>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <Link
            href="/portal/topup"
            className="inline-block rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            返回儲值頁面
          </Link>
        </div>
      )}
    </div>
  )
}
