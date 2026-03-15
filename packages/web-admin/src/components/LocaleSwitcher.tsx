'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const LOCALES = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
]

function getCurrentLocale(): string {
  if (typeof document === 'undefined') return 'zh-TW'
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
  if (match) return match[1]
  const lang = navigator.language || ''
  return lang.toLowerCase().includes('zh') ? 'zh-TW' : 'en'
}

export default function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher')
  const router = useRouter()
  const [current, setCurrent] = useState<string>('zh-TW')

  useEffect(() => {
    setCurrent(getCurrentLocale())
  }, [])

  function handleChange(locale: string) {
    // Set cookie that expires in 1 year
    const expires = new Date()
    expires.setFullYear(expires.getFullYear() + 1)
    document.cookie = `NEXT_LOCALE=${locale}; path=/; expires=${expires.toUTCString()}`
    setCurrent(locale)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">{t('label')}:</span>
      {LOCALES.map((loc) => (
        <button
          key={loc.value}
          onClick={() => handleChange(loc.value)}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            current === loc.value
              ? 'bg-gray-200 text-gray-900'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {loc.label}
        </button>
      ))}
    </div>
  )
}
