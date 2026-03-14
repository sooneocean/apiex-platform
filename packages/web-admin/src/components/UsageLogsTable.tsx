'use client'

import { UsageLog } from '@/lib/api'

interface UsageLogsTableProps {
  logs: UsageLog[]
  loading?: boolean
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === 'success' || status === '200'
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {status}
    </span>
  )
}

export default function UsageLogsTable({ logs, loading }: UsageLogsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Key Prefix</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Model</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Upstream</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Prompt</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Completion</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Latency</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                {log.api_key_prefix}••••
              </td>
              <td className="px-4 py-2.5 text-gray-800">{log.model_tag}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">{log.upstream_model}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                {log.prompt_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                {log.completion_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                {log.total_tokens.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                {log.latency_ms}ms
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={log.status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                {new Date(log.created_at).toLocaleString('zh-TW')}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                No logs found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
