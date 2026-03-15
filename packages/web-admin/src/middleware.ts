import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookiesToSet = Parameters<NonNullable<CookieMethodsServer['setAll']>>[0]

/**
 * 呼叫 /auth/me 判斷用戶是否為 Admin。
 * 失敗時（網路錯誤、401 等）回傳 null，由呼叫方決定降級行為。
 */
async function fetchIsAdmin(token: string): Promise<boolean | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json() as { data?: { isAdmin?: boolean } }
    return json.data?.isAdmin ?? false
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookiesToSet) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user ?? null
  const { pathname } = request.nextUrl

  // ── 未認證用戶保護 ───────────────────────────────────────────────────────────

  if (!user && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  if (!user && pathname.startsWith('/portal')) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  // ── 已認證用戶的角色分流 ─────────────────────────────────────────────────────

  if (user && pathname === '/admin/login') {
    // 嘗試取得 isAdmin，失敗時降級為原有行為（導向 /admin/dashboard）
    const token = session?.access_token
    if (token) {
      const isAdmin = await fetchIsAdmin(token)
      if (isAdmin === true) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
      } else if (isAdmin === false) {
        return NextResponse.redirect(new URL('/portal/dashboard', request.url))
      }
      // isAdmin === null（呼叫失敗）→ 降級：保持原有行為
    }
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // ── 非 Admin 用戶不得訪問 /admin/* ───────────────────────────────────────────
  // （僅在非 login 頁面且已登入時才檢查）

  if (user && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = session?.access_token
    if (token) {
      const isAdmin = await fetchIsAdmin(token)
      if (isAdmin === false) {
        // 確認為非 Admin → 重導向 portal
        return NextResponse.redirect(new URL('/portal/dashboard', request.url))
      }
      // isAdmin === null（呼叫失敗）→ 降級：允許訪問，不阻斷
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
}
