'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  makeRateLimitsApi,
  type RateLimitTier,
  type ModelRateOverride,
} from '@/lib/api'

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  type: 'success' | 'error'
  message: string
  onClose: () => void
}

function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm ${
        type === 'success'
          ? 'bg-white border-green-200 text-green-700'
          : 'bg-white border-red-200 text-red-700'
      }`}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      {message}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100 text-xs">
        ✕
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RateLimitsPage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Tiers
  const [tiers, setTiers] = useState<RateLimitTier[]>([])
  const [showTierForm, setShowTierForm] = useState(false)
  const [newTier, setNewTier] = useState({ tier: '', rpm: '', tpm: '' })
  const [savingTier, setSavingTier] = useState(false)
  const [editingTier, setEditingTier] = useState<string | null>(null)
  const [editTierValues, setEditTierValues] = useState<{ rpm: string; tpm: string }>({ rpm: '', tpm: '' })
  const [deletingTier, setDeletingTier] = useState<string | null>(null)

  // Overrides
  const [overrides, setOverrides] = useState<ModelRateOverride[]>([])
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [newOverride, setNewOverride] = useState({ tier: '', model_tag: '', rpm: '', tpm: '' })
  const [savingOverride, setSavingOverride] = useState(false)
  const [editingOverride, setEditingOverride] = useState<string | null>(null)
  const [editOverrideValues, setEditOverrideValues] = useState<{ rpm: string; tpm: string }>({ rpm: '', tpm: '' })
  const [deletingOverride, setDeletingOverride] = useState<string | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
  }

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      const [tiersResp, overridesResp] = await Promise.all([
        api.listTiers(),
        api.listOverrides(),
      ])
      setTiers(tiersResp.data)
      setOverrides(overridesResp.data)
    } catch (err) {
      console.error('Failed to load rate limits:', err)
      showToast('error', '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Tier Handlers ──────────────────────────────────────────────────────────

  const handleCreateTier = async () => {
    if (!newTier.tier.trim()) {
      showToast('error', 'Tier 名稱為必填')
      return
    }
    const rpm = parseInt(newTier.rpm, 10)
    const tpm = parseInt(newTier.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', 'RPM 必須為整數且 >= -1（-1 表示無限制）')
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', 'TPM 必須為整數且 >= -1（-1 表示無限制）')
      return
    }

    setSavingTier(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.createTier({ tier: newTier.tier.trim(), rpm, tpm })
      setNewTier({ tier: '', rpm: '', tpm: '' })
      setShowTierForm(false)
      showToast('success', 'Tier 已新增')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '新增失敗'
      showToast('error', msg)
    } finally {
      setSavingTier(false)
    }
  }

  const handleStartEditTier = (tier: RateLimitTier) => {
    setEditingTier(tier.tier)
    setEditTierValues({ rpm: String(tier.rpm), tpm: String(tier.tpm) })
  }

  const handleSaveTier = async (tierName: string) => {
    const rpm = parseInt(editTierValues.rpm, 10)
    const tpm = parseInt(editTierValues.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', 'RPM 必須為整數且 >= -1')
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', 'TPM 必須為整數且 >= -1')
      return
    }

    setSavingTier(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.updateTier(tierName, { rpm, tpm })
      setEditingTier(null)
      showToast('success', 'Tier 已更新')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新失敗'
      showToast('error', msg)
    } finally {
      setSavingTier(false)
    }
  }

  const handleDeleteTier = async (tierName: string) => {
    if (!window.confirm(`確定要刪除 Tier「${tierName}」？此操作無法復原。`)) return

    setDeletingTier(tierName)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.deleteTier(tierName)
      showToast('success', `Tier「${tierName}」已刪除`)
      await loadData()
    } catch (err) {
      const errObj = err as Error & { status?: number }
      if (errObj.status === 409) {
        showToast('error', errObj.message || `此 tier 仍有 key 使用中，無法刪除`)
      } else {
        showToast('error', errObj.message || '刪除失敗')
      }
    } finally {
      setDeletingTier(null)
    }
  }

  // ─── Override Handlers ──────────────────────────────────────────────────────

  const handleCreateOverride = async () => {
    if (!newOverride.tier.trim()) {
      showToast('error', 'Tier 為必填')
      return
    }
    if (!newOverride.model_tag.trim()) {
      showToast('error', 'Model Tag 為必填')
      return
    }
    const rpm = parseInt(newOverride.rpm, 10)
    const tpm = parseInt(newOverride.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', 'RPM 必須為整數且 >= -1（-1 表示無限制）')
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', 'TPM 必須為整數且 >= -1（-1 表示無限制）')
      return
    }

    setSavingOverride(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.createOverride({
        tier: newOverride.tier.trim(),
        model_tag: newOverride.model_tag.trim(),
        rpm,
        tpm,
      })
      setNewOverride({ tier: '', model_tag: '', rpm: '', tpm: '' })
      setShowOverrideForm(false)
      showToast('success', 'Override 已新增')
      await loadData()
    } catch (err) {
      const errObj = err as Error & { status?: number }
      if (errObj.status === 409) {
        showToast('error', '此 tier + model 組合已存在')
      } else {
        showToast('error', errObj.message || '新增失敗')
      }
    } finally {
      setSavingOverride(false)
    }
  }

  const handleStartEditOverride = (override: ModelRateOverride) => {
    setEditingOverride(override.id)
    setEditOverrideValues({ rpm: String(override.rpm), tpm: String(override.tpm) })
  }

  const handleSaveOverride = async (id: string) => {
    const rpm = parseInt(editOverrideValues.rpm, 10)
    const tpm = parseInt(editOverrideValues.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', 'RPM 必須為整數且 >= -1')
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', 'TPM 必須為整數且 >= -1')
      return
    }

    setSavingOverride(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.updateOverride(id, { rpm, tpm })
      setEditingOverride(null)
      showToast('success', 'Override 已更新')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新失敗'
      showToast('error', msg)
    } finally {
      setSavingOverride(false)
    }
  }

  const handleDeleteOverride = async (id: string) => {
    if (!window.confirm('確定要刪除此 Override？此操作無法復原。')) return

    setDeletingOverride(id)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.deleteOverride(id)
      showToast('success', 'Override 已刪除')
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '刪除失敗'
      showToast('error', msg)
    } finally {
      setDeletingOverride(null)
    }
  }

  // ─── Loading Skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-100 rounded" />
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Rate Limits 設定</h1>

      {/* ── Tiers ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium text-gray-900">Tier 管理</h2>
          <button
            onClick={() => {
              setShowTierForm((v) => !v)
              setNewTier({ tier: '', rpm: '', tpm: '' })
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            新增 Tier
          </button>
        </div>

        {/* New Tier Form */}
        {showTierForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">新增 Tier</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tier 名稱 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newTier.tier}
                  onChange={(e) => setNewTier((v) => ({ ...v, tier: e.target.value }))}
                  placeholder="例如：enterprise"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">RPM（-1 = 無限制）<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newTier.rpm}
                  onChange={(e) => setNewTier((v) => ({ ...v, rpm: e.target.value }))}
                  placeholder="60"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TPM（-1 = 無限制）<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newTier.tpm}
                  onChange={(e) => setNewTier((v) => ({ ...v, tpm: e.target.value }))}
                  placeholder="500000"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateTier}
                disabled={savingTier}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingTier ? '儲存中...' : '儲存'}
              </button>
              <button
                onClick={() => setShowTierForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Tiers Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {tiers.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">尚無 Tier 設定，請點擊「新增 Tier」開始設定</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">RPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">TPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">建立時間</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tiers.map((tier) => (
                  <tr key={tier.tier} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{tier.tier}</td>
                    <td className="px-4 py-3">
                      {editingTier === tier.tier ? (
                        <input
                          type="number"
                          value={editTierValues.rpm}
                          onChange={(e) => setEditTierValues((v) => ({ ...v, rpm: e.target.value }))}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className={tier.rpm === -1 ? 'text-gray-400 italic' : ''}>
                          {tier.rpm === -1 ? '無限制' : tier.rpm.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingTier === tier.tier ? (
                        <input
                          type="number"
                          value={editTierValues.tpm}
                          onChange={(e) => setEditTierValues((v) => ({ ...v, tpm: e.target.value }))}
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className={tier.tpm === -1 ? 'text-gray-400 italic' : ''}>
                          {tier.tpm === -1 ? '無限制' : tier.tpm.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(tier.created_at).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-4 py-3">
                      {editingTier === tier.tier ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveTier(tier.tier)}
                            disabled={savingTier}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {savingTier ? '...' : '儲存'}
                          </button>
                          <button
                            onClick={() => setEditingTier(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartEditTier(tier)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDeleteTier(tier.tier)}
                            disabled={deletingTier === tier.tier}
                            className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            {deletingTier === tier.tier ? '...' : '刪除'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Model Overrides ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium text-gray-900">Model Override 管理</h2>
          <button
            onClick={() => {
              setShowOverrideForm((v) => !v)
              setNewOverride({ tier: '', model_tag: '', rpm: '', tpm: '' })
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            新增 Override
          </button>
        </div>

        {/* New Override Form */}
        {showOverrideForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">新增 Model Override</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tier <span className="text-red-500">*</span></label>
                <select
                  value={newOverride.tier}
                  onChange={(e) => setNewOverride((v) => ({ ...v, tier: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">選擇 Tier...</option>
                  {tiers.map((t) => (
                    <option key={t.tier} value={t.tier}>{t.tier}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Model Tag <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newOverride.model_tag}
                  onChange={(e) => setNewOverride((v) => ({ ...v, model_tag: e.target.value }))}
                  placeholder="例如：apex-smart"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">RPM（-1 = 無限制）<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newOverride.rpm}
                  onChange={(e) => setNewOverride((v) => ({ ...v, rpm: e.target.value }))}
                  placeholder="10"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TPM（-1 = 無限制）<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newOverride.tpm}
                  onChange={(e) => setNewOverride((v) => ({ ...v, tpm: e.target.value }))}
                  placeholder="100000"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateOverride}
                disabled={savingOverride}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingOverride ? '儲存中...' : '儲存'}
              </button>
              <button
                onClick={() => setShowOverrideForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Overrides Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {overrides.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">尚無 Model Override 設定</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Model Tag</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">RPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">TPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overrides.map((override) => (
                  <tr key={override.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{override.tier}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-900">{override.model_tag}</td>
                    <td className="px-4 py-3">
                      {editingOverride === override.id ? (
                        <input
                          type="number"
                          value={editOverrideValues.rpm}
                          onChange={(e) => setEditOverrideValues((v) => ({ ...v, rpm: e.target.value }))}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className={override.rpm === -1 ? 'text-gray-400 italic' : ''}>
                          {override.rpm === -1 ? '無限制' : override.rpm.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingOverride === override.id ? (
                        <input
                          type="number"
                          value={editOverrideValues.tpm}
                          onChange={(e) => setEditOverrideValues((v) => ({ ...v, tpm: e.target.value }))}
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className={override.tpm === -1 ? 'text-gray-400 italic' : ''}>
                          {override.tpm === -1 ? '無限制' : override.tpm.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingOverride === override.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveOverride(override.id)}
                            disabled={savingOverride}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {savingOverride ? '...' : '儲存'}
                          </button>
                          <button
                            onClick={() => setEditingOverride(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartEditOverride(override)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDeleteOverride(override.id)}
                            disabled={deletingOverride === override.id}
                            className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            {deletingOverride === override.id ? '...' : '刪除'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
