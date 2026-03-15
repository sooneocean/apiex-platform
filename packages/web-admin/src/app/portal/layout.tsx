'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import LocaleSwitcher from '@/components/LocaleSwitcher'

interface PortalLayoutProps {
  children: React.ReactNode
}

export default function PortalLayout({ children }: PortalLayoutProps) {
  const t = useTranslations('portalNav')
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { href: '/portal/dashboard', label: t('dashboard') },
    { href: '/portal/topup', label: t('topup') },
    { href: '/portal/logs', label: t('logs') },
    { href: '/portal/settings/webhooks', label: t('webhooks') },
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <span className="font-semibold text-gray-800 text-base">Apiex Portal</span>
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <div className="ml-2 pl-2 border-l border-gray-200">
              <LocaleSwitcher />
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
