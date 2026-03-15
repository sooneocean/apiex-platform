import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { routing, type Locale } from './routing'

export default getRequestConfig(async () => {
  // 1. Check cookie for manual override
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value

  // 2. Fall back to Accept-Language header
  const headerStore = await headers()
  const acceptLang = headerStore.get('accept-language') ?? ''
  const browserLocale = acceptLang.toLowerCase().includes('zh') ? 'zh-TW' : 'en'

  // Validate that locale is one of the supported locales
  const rawLocale = localeCookie || browserLocale
  const locale = (routing.locales as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
