import { apiRequest } from '../lib/api.js'

interface Model {
  id: string
  object: string
  owned_by?: string
}

interface UsageSummary {
  total_requests: number
  total_tokens: number
  quota_remaining: number
  breakdown: Array<{ model_tag: string; tokens: number; requests: number }>
}

export async function statusAction(opts: { json?: boolean }): Promise<void> {
  const [modelsRes, usageRes] = await Promise.all([
    apiRequest<{ data: Model[] }>('GET', '/v1/models'),
    apiRequest<{ data: UsageSummary }>('GET', '/v1/usage/summary'),
  ])

  if (opts.json) {
    console.log(
      JSON.stringify({
        models: modelsRes.ok ? modelsRes.data : { error: modelsRes.status },
        usage: usageRes.ok ? usageRes.data : { error: usageRes.status },
      }, null, 2)
    )
    return
  }

  console.log('=== Models ===')
  if (modelsRes.ok && modelsRes.data.data) {
    for (const m of modelsRes.data.data) {
      console.log(`  ${m.id}${m.owned_by ? ` (${m.owned_by})` : ''}`)
    }
  } else {
    console.log(`  (unavailable — status ${modelsRes.status})`)
  }

  console.log('\n=== Usage ===')
  if (usageRes.ok) {
    const u = usageRes.data.data
    console.log(`  Requests: ${u.total_requests}`)
    console.log(`  Tokens: ${u.total_tokens}`)
    console.log(`  Quota remaining: ${u.quota_remaining === -1 ? 'unlimited' : u.total_tokens}`)
  } else {
    console.log(`  (unavailable — status ${usageRes.status})`)
  }
}
