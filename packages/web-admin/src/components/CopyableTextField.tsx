'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyableTextFieldProps {
  value: string
  label?: string
  monospace?: boolean
}

export default function CopyableTextField({
  value,
  label,
  monospace = false,
}: CopyableTextFieldProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full">
      {label && (
        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      )}
      <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
        <span
          className={`flex-1 text-sm break-all text-gray-800 ${
            monospace ? 'font-mono' : ''
          }`}
        >
          {value}
        </span>
        <button
          onClick={handleCopy}
          title="複製"
          className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {copied ? (
            <Check size={16} className="text-green-500" />
          ) : (
            <Copy size={16} />
          )}
        </button>
      </div>
    </div>
  )
}
