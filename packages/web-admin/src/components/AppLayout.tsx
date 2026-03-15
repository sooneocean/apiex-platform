'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import LocaleSwitcher from './LocaleSwitcher'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const t = useTranslations('nav')
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { href: '/admin/dashboard', label: t('dashboard') },
    { href: '/admin/analytics', label: t('analytics') },
    { href: '/admin/logs', label: t('logs') },
    { href: '/admin/topup-logs', label: t('topupLogs') },
    { href: '/admin/webhooks', label: t('webhooks') },
    { href: '/admin/settings/rates', label: t('settingsRates') },
    { href: '/admin/settings/models', label: t('settingsModels') },
    { href: '/admin/settings/routes', label: t('settingsRoutes') },
    { href: '/admin/settings/webhooks', label: t('settingsWebhooks') },
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-700">
          <span className="text-white font-semibold text-base">Apiex Admin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 py-3 border-t border-gray-700 space-y-2">
          <div className="px-1">
            <LocaleSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
