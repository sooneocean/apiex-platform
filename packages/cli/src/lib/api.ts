import { getApiKey, getBaseUrl } from './config.js'

export interface ApiResponse<T = unknown> {
  ok: boolean
  status: number
  data: T
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl()
  const apiKey = getApiKey()
  const url = `${baseUrl}${path}`

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = (await res.json().catch(() => ({}))) as T

  return { ok: res.ok, status: res.status, data }
}
