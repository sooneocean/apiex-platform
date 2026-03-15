'use client'

import Link from 'next/link'

export default function TopupCancelPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-4 text-4xl text-gray-400">×</div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">付款已取消</h1>
      <p className="text-sm text-gray-500 mb-6">本次交易已取消，你的帳戶未被扣款。</p>
      <Link
        href="/portal/topup"
        className="inline-block rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
      >
        返回儲值頁面
      </Link>
    </div>
  )
}
