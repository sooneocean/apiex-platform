'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('rateLimits')
  const tc = useTranslations('common')

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
      showToast('error', t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [getToken, t])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Tier Handlers ──────────────────────────────────────────────────────────

  const handleCreateTier = async () => {
    if (!newTier.tier.trim()) {
      showToast('error', t('tierNameRequired'))
      return
    }
    const rpm = parseInt(newTier.rpm, 10)
    const tpm = parseInt(newTier.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', t('rpmInvalid'))
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', t('tpmInvalid'))
      return
    }

    setSavingTier(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.createTier({ tier: newTier.tier.trim(), rpm, tpm })
      setNewTier({ tier: '', rpm: '', tpm: '' })
      setShowTierForm(false)
      showToast('success', t('tierAdded'))
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('addFailed')
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
      showToast('error', t('rpmInvalidShort'))
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', t('tpmInvalidShort'))
      return
    }

    setSavingTier(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.updateTier(tierName, { rpm, tpm })
      setEditingTier(null)
      showToast('success', t('tierUpdated'))
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('updateFailed')
      showToast('error', msg)
    } finally {
      setSavingTier(false)
    }
  }

  const handleDeleteTier = async (tierName: string) => {
    if (!window.confirm(t('confirmDeleteTier', { tier: tierName }))) return

    setDeletingTier(tierName)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.deleteTier(tierName)
      showToast('success', t('tierDeleted', { tier: tierName }))
      await loadData()
    } catch (err) {
      const errObj = err as Error & { status?: number }
      if (errObj.status === 409) {
        showToast('error', errObj.message || t('tierInUse'))
      } else {
        showToast('error', errObj.message || t('deleteFailed'))
      }
    } finally {
      setDeletingTier(null)
    }
  }

  // ─── Override Handlers ──────────────────────────────────────────────────────

  const handleCreateOverride = async () => {
    if (!newOverride.tier.trim()) {
      showToast('error', t('tierRequired'))
      return
    }
    if (!newOverride.model_tag.trim()) {
      showToast('error', t('modelTagRequired'))
      return
    }
    const rpm = parseInt(newOverride.rpm, 10)
    const tpm = parseInt(newOverride.tpm, 10)
    if (isNaN(rpm) || rpm < -1) {
      showToast('error', t('rpmInvalid'))
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', t('tpmInvalid'))
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
      showToast('success', t('overrideAdded'))
      await loadData()
    } catch (err) {
      const errObj = err as Error & { status?: number }
      if (errObj.status === 409) {
        showToast('error', t('overrideExists'))
      } else {
        showToast('error', errObj.message || t('addFailed'))
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
      showToast('error', t('rpmInvalidShort'))
      return
    }
    if (isNaN(tpm) || tpm < -1) {
      showToast('error', t('tpmInvalidShort'))
      return
    }

    setSavingOverride(true)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.updateOverride(id, { rpm, tpm })
      setEditingOverride(null)
      showToast('success', t('overrideUpdated'))
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('updateFailed')
      showToast('error', msg)
    } finally {
      setSavingOverride(false)
    }
  }

  const handleDeleteOverride = async (id: string) => {
    if (!window.confirm(t('confirmDeleteOverride'))) return

    setDeletingOverride(id)
    try {
      const token = await getToken()
      const api = makeRateLimitsApi(token)
      await api.deleteOverride(id)
      showToast('success', t('overrideDeleted'))
      await loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('deleteFailed')
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
      <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>

      {/* ── Tiers ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium text-gray-900">{t('tierManagement')}</h2>
          <button
            onClick={() => {
              setShowTierForm((v) => !v)
              setNewTier({ tier: '', rpm: '', tpm: '' })
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            {t('addTier')}
          </button>
        </div>

        {/* New Tier Form */}
        {showTierForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">{t('newTier')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('tierName')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newTier.tier}
                  onChange={(e) => setNewTier((v) => ({ ...v, tier: e.target.value }))}
                  placeholder={t('tierNamePlaceholder')}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('rpmLabel')}<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newTier.rpm}
                  onChange={(e) => setNewTier((v) => ({ ...v, rpm: e.target.value }))}
                  placeholder={t('rpmPlaceholder')}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('tpmLabel')}<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newTier.tpm}
                  onChange={(e) => setNewTier((v) => ({ ...v, tpm: e.target.value }))}
                  placeholder={t('tpmPlaceholder')}
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
                {savingTier ? tc('saving') : tc('save')}
              </button>
              <button
                onClick={() => setShowTierForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Tiers Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {tiers.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{t('noTiers')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">RPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">TPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('createdAt')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('operations')}</th>
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
                          {tier.rpm === -1 ? tc('unlimited') : tier.rpm.toLocaleString()}
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
                          {tier.tpm === -1 ? tc('unlimited') : tier.tpm.toLocaleString()}
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
                            {savingTier ? '...' : tc('save')}
                          </button>
                          <button
                            onClick={() => setEditingTier(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            {tc('cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartEditTier(tier)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            {tc('edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteTier(tier.tier)}
                            disabled={deletingTier === tier.tier}
                            className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            {deletingTier === tier.tier ? '...' : tc('delete')}
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
          <h2 className="text-base font-medium text-gray-900">{t('overrideManagement')}</h2>
          <button
            onClick={() => {
              setShowOverrideForm((v) => !v)
              setNewOverride({ tier: '', model_tag: '', rpm: '', tpm: '' })
            }}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            {t('addOverride')}
          </button>
        </div>

        {/* New Override Form */}
        {showOverrideForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">{t('newOverride')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tier <span className="text-red-500">*</span></label>
                <select
                  value={newOverride.tier}
                  onChange={(e) => setNewOverride((v) => ({ ...v, tier: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">{t('selectTier')}</option>
                  {tiers.map((t_tier) => (
                    <option key={t_tier.tier} value={t_tier.tier}>{t_tier.tier}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('modelTagLabel')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newOverride.model_tag}
                  onChange={(e) => setNewOverride((v) => ({ ...v, model_tag: e.target.value }))}
                  placeholder={t('modelTagPlaceholder')}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('rpmLabel')}<span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={newOverride.rpm}
                  onChange={(e) => setNewOverride((v) => ({ ...v, rpm: e.target.value }))}
                  placeholder="10"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('tpmLabel')}<span className="text-red-500">*</span></label>
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
                {savingOverride ? tc('saving') : tc('save')}
              </button>
              <button
                onClick={() => setShowOverrideForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Overrides Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {overrides.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{t('noOverrides')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('modelTagLabel')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">RPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">TPM</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('operations')}</th>
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
                          {override.rpm === -1 ? tc('unlimited') : override.rpm.toLocaleString()}
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
                          {override.tpm === -1 ? tc('unlimited') : override.tpm.toLocaleString()}
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
                            {savingOverride ? '...' : tc('save')}
                          </button>
                          <button
                            onClick={() => setEditingOverride(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            {tc('cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartEditOverride(override)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200 transition-colors"
                          >
                            {tc('edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteOverride(override.id)}
                            disabled={deletingOverride === override.id}
                            className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            {deletingOverride === override.id ? '...' : tc('delete')}
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
