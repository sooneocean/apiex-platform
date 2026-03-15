'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { makeTopupApi } from '@/lib/api'

interface Plan {
  id: string
  price: number
  tokens: number
  label: string
  description: string
}

const PLANS: Plan[] = [
  {
    id: 'plan_5',
    price: 5,
    tokens: 500_000,
    label: '$5',
    description: '500,000 tokens',
  },
  {
    id: 'plan_10',
    price: 10,
    tokens: 1_000_000,
    label: '$10',
    description: '1,000,000 tokens',
  },
  {
    id: 'plan_20',
    price: 20,
    tokens: 2_000_000,
    label: '$20',
    description: '2,000,000 tokens',
  },
]

export default function TopupPage() {
  const router = useRouter()
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout(planId: string) {
    setLoadingPlanId(planId)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        router.push('/admin/login')
        return
      }
      const token = sessionData.session.access_token
      const topupApi = makeTopupApi(token)
      const result = await topupApi.checkout(planId)
      window.location.href = result.data.checkout_url
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立結帳失敗，請稍後再試')
      setLoadingPlanId(null)
    }
  }

  const isLoading = loadingPlanId !== null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">儲值方案</h1>
        <p className="mt-1 text-sm text-gray-500">選擇適合你的方案，立即充值 tokens</p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col"
          >
            <div className="mb-4">
              <span className="text-3xl font-bold text-gray-900">{plan.label}</span>
            </div>
            <div className="flex-1 mb-6">
              <p className="text-sm text-gray-500">取得</p>
              <p className="text-lg font-semibold text-gray-800 mt-0.5">{plan.description}</p>
            </div>
            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={isLoading}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingPlanId === plan.id ? '處理中...' : '前往付款'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
