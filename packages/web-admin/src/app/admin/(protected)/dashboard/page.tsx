'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { makeAdminApi, makeKeysApi, AdminUser, ApiKey } from '@/lib/api'
import UserTable from '@/components/UserTable'
import ApiKeyCard from '@/components/ApiKeyCard'
import ApiKeyCreateModal from '@/components/ApiKeyCreateModal'
import LoadingSkeleton from '@/components/analytics/LoadingSkeleton'
import { Plus, RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const token = await getToken()
      const adminApi = makeAdminApi(token)
      const response = await adminApi.getUsers()
      return response.data as AdminUser[]
    },
  })

  const keysQuery = useQuery({
    queryKey: ['admin', 'keys'],
    queryFn: async () => {
      const token = await getToken()
      const keysApi = makeKeysApi(token)
      const response = await keysApi.list()
      return response.data as ApiKey[]
    },
  })

  const users = usersQuery.data ?? []
  const apiKeys = keysQuery.data ?? []

  async function handleQuotaUpdate(userId: string, quota: number) {
    const token = await getToken()
    const adminApi = makeAdminApi(token)
    await adminApi.setQuota(userId, quota)
    queryClient.setQueryData<AdminUser[]>(['admin', 'users'], (prev) =>
      prev?.map((u) => (u.id === userId ? { ...u, quota_tokens: quota } : u))
    )
  }

  async function handleTierUpdate(userId: string, tier: string) {
    const token = await getToken()
    const adminApi = makeAdminApi(token)
    await adminApi.setRateLimit(userId, tier)
    queryClient.setQueryData<AdminUser[]>(['admin', 'users'], (prev) =>
      prev?.map((u) => (u.id === userId ? { ...u, rate_limit_tier: tier } : u))
    )
  }

  async function handleRevokeKey(id: string) {
    const token = await getToken()
    const keysApi = makeKeysApi(token)
    await keysApi.revoke(id)
    queryClient.setQueryData<ApiKey[]>(['admin', 'keys'], (prev) =>
      prev?.map((k) => (k.id === id ? { ...k, status: 'revoked' } : k))
    )
  }

  async function handleCreateKey(name: string, spendLimitUsd?: number, expiresAt?: string): Promise<{ key: string }> {
    const token = await getToken()
    const keysApi = makeKeysApi(token)
    const response = await keysApi.create(name, spendLimitUsd, expiresAt)
    queryClient.invalidateQueries({ queryKey: ['admin', 'keys'] })
    return { key: response.data.key }
  }

  return (
    <div className="p-8 space-y-10">
      {/* Users Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">用戶管理</h2>
          <button
            onClick={() => usersQuery.refetch()}
            disabled={usersQuery.isLoading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={usersQuery.isFetching ? 'animate-spin' : ''} />
            重新整理
          </button>
        </div>
        {usersQuery.error && (
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {usersQuery.error instanceof Error ? usersQuery.error.message : 'Failed to load users'}
          </div>
        )}
        {usersQuery.isLoading ? (
          <LoadingSkeleton variant="table" />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <UserTable users={users} onQuotaUpdate={handleQuotaUpdate} onTierUpdate={handleTierUpdate} />
          </div>
        )}
      </section>

      {/* API Keys Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => keysQuery.refetch()}
              disabled={keysQuery.isLoading}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={keysQuery.isFetching ? 'animate-spin' : ''} />
              重新整理
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              <Plus size={14} />
              建立 Key
            </button>
          </div>
        </div>
        {keysQuery.error && (
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {keysQuery.error instanceof Error ? keysQuery.error.message : 'Failed to load API keys'}
          </div>
        )}
        {keysQuery.isLoading ? (
          <LoadingSkeleton variant="cards" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apiKeys.map((key) => (
              <ApiKeyCard key={key.id} apiKey={key} onRevoke={handleRevokeKey} />
            ))}
            {apiKeys.length === 0 && (
              <p className="col-span-full text-center text-sm text-gray-400 py-8">
                尚無 API Key。
              </p>
            )}
          </div>
        )}
      </section>

      <ApiKeyCreateModal
        open={createModalOpen}
        onCreate={handleCreateKey}
        onClose={() => setCreateModalOpen(false)}
      />
    </div>
  )
}
