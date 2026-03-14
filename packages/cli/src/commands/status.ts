import { apiRequest } from '../lib/api.js'

interface Model {
  id: string
  object: string
  owned_by?: string
}

interface UsageSummary {
  totalRequests: number
  totalTokens: number
  period: string
}

export async function statusAction(opts: { json?: boolean }): Promise<void> {
  const [modelsRes, usageRes] = await Promise.all([
    apiRequest<{ data: Model[] }>('GET', '/v1/models'),
    apiRequest<UsageSummary>('GET', '/usage/summary'),
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
    const u = usageRes.data
    console.log(`  Period: ${u.period}`)
    console.log(`  Requests: ${u.totalRequests}`)
    console.log(`  Tokens: ${u.totalTokens}`)
  } else {
    console.log(`  (unavailable — status ${usageRes.status})`)
  }
}
