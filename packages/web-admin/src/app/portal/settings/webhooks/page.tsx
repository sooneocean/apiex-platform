'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import {
  makeWebhooksApi,
  NOTIFICATION_EVENTS,
  type WebhookConfig,
  type WebhookLog,
  type NotificationEventType,
} from '@/lib/api'

export default function WebhookSettingsPage() {
  const t = useTranslations('webhooks')
  const tc = useTranslations('common')

  const [config, setConfig] = useState<WebhookConfig | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<NotificationEventType[]>(
    NOTIFICATION_EVENTS.map((e) => e.value)
  )

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ''
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.get()
      const existing = resp.data

      if (existing) {
        setConfig(existing)
        setUrl(existing.url)
        setSelectedEvents(existing.events as NotificationEventType[])

        const logsResp = await api.logs(existing.id, 20)
        setLogs(logsResp.data)
      } else {
        setConfig(null)
        setLogs([])
      }
    } catch (err) {
      console.error('Failed to load webhook config:', err)
      setError(err instanceof Error ? err.message : tc('networkError'))
    } finally {
      setLoading(false)
    }
  }, [getToken, tc])

  useEffect(() => {
    loadData()
  }, [loadData])

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const toggleEvent = (event: NotificationEventType) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  async function handleSave() {
    if (!url.trim()) {
      setError(t('urlRequired'))
      return
    }
    try {
      new URL(url)
    } catch {
      setError(t('urlInvalid'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.upsert({
        url: url.trim(),
        ...(secret.trim() ? { secret: secret.trim() } : {}),
        events: selectedEvents,
      })
      setConfig(resp.data)
      showSuccess(t('saved'))
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!config) return
    if (!confirm(t('confirmDeleteAlt'))) return
    setDeleting(true)
    setError(null)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      await api.remove(config.id)
      setConfig(null)
      setUrl('')
      setSecret('')
      setSelectedEvents(NOTIFICATION_EVENTS.map((e) => e.value))
      setLogs([])
      showSuccess(t('deleted'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  async function handleTest() {
    if (!config) {
      setError(t('saveBefore'))
      return
    }
    setTesting(true)
    setError(null)
    try {
      const token = await getToken()
      const api = makeWebhooksApi(token)
      const resp = await api.test()
      showSuccess(t('testComplete', { code: resp.data.status_code ?? tc('noResponse') }))
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('testFail'))
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">{tc('loading')}</div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('notificationTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('notificationSubtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-base font-medium text-gray-800 mb-4">{t('configSection')}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('urlLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('signingSecretLabel')}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={t('signingSecretPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showSecret ? tc('hide') : tc('show')}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">{t('signingSecretHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('eventsLabel')}</label>
            <div className="space-y-2">
              {NOTIFICATION_EVENTS.map((e) => (
                <label key={e.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(e.value)}
                    onChange={() => toggleEvent(e.value)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span className="text-sm text-gray-700">{e.label}</span>
                  <span className="text-xs text-gray-400 font-mono">{e.value}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('saving') : config ? t('updateConfig') : t('saveConfig')}
          </button>

          {config && (
            <>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? t('sending') : t('testPush')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? t('deleting') : t('deleteConfig')}
              </button>
            </>
          )}
        </div>
      </div>

      {config && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-medium text-gray-800 mb-4">{t('logsSection')}</h2>

          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('noLogs')}</p>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('eventColumn')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('statusCodeColumn')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t('timeColumn')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{log.event}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            log.status_code && log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.status_code ?? tc('noResponse')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
