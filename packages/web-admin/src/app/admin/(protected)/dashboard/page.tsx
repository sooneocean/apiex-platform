'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { makeAdminApi, makeKeysApi, AdminUser, ApiKey } from '@/lib/api'
import UserTable from '@/components/UserTable'
import ApiKeyCard from '@/components/ApiKeyCard'
import ApiKeyCreateModal from '@/components/ApiKeyCreateModal'
import { Plus, RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [keysLoading, setKeysLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const token = await getToken()
      const adminApi = makeAdminApi(token)
      const response = await adminApi.getUsers()
      setUsers(response.data)
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true)
    setKeysError(null)
    try {
      const token = await getToken()
      const keysApi = makeKeysApi(token)
      const response = await keysApi.list()
      setApiKeys(response.data)
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : 'Failed to load API keys')
    } finally {
      setKeysLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchKeys()
  }, [fetchUsers, fetchKeys])

  async function handleQuotaUpdate(userId: string, quota: number) {
    const token = await getToken()
    const adminApi = makeAdminApi(token)
    await adminApi.setQuota(userId, quota)
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, quota_tokens: quota } : u))
    )
  }

  async function handleTierUpdate(userId: string, tier: string) {
    const token = await getToken()
    const adminApi = makeAdminApi(token)
    await adminApi.setRateLimit(userId, tier)
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, rate_limit_tier: tier } : u))
    )
  }

  async function handleRevokeKey(id: string) {
    const token = await getToken()
    const keysApi = makeKeysApi(token)
    await keysApi.revoke(id)
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: 'revoked' } : k))
    )
  }

  async function handleCreateKey(name: string, spendLimitUsd?: number, expiresAt?: string): Promise<{ key: string }> {
    const token = await getToken()
    const keysApi = makeKeysApi(token)
    const response = await keysApi.create(name, spendLimitUsd, expiresAt)
    await fetchKeys()
    return { key: response.data.key }
  }

  return (
    <div className="p-8 space-y-10">
      {/* Users Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">用戶管理</h2>
          <button
            onClick={fetchUsers}
            disabled={usersLoading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
            重新整理
          </button>
        </div>
        {usersError && (
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {usersError}
          </div>
        )}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {usersLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading users...
            </div>
          ) : (
            <UserTable users={users} onQuotaUpdate={handleQuotaUpdate} onTierUpdate={handleTierUpdate} />
          )}
        </div>
      </section>

      {/* API Keys Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchKeys}
              disabled={keysLoading}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={keysLoading ? 'animate-spin' : ''} />
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
        {keysError && (
          <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {keysError}
          </div>
        )}
        {keysLoading ? (
          <div className="text-sm text-gray-400 text-center py-8">Loading API keys...</div>
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
