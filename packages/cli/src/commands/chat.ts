import { apiRequest } from '../lib/api.js'

interface ChatResponse {
  id: string
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export async function chatAction(
  prompt: string,
  opts: { model: string; json?: boolean }
): Promise<void> {
  const res = await apiRequest<ChatResponse>('POST', '/v1/chat/completions', {
    model: opts.model,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!res.ok) {
    console.error(`Error: ${res.status}`)
    if (opts.json) console.log(JSON.stringify(res.data))
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2))
    return
  }

  const content = res.data.choices?.[0]?.message?.content ?? '(no response)'
  console.log(content)

  if (res.data.usage) {
    const u = res.data.usage
    console.log(`\n[tokens: ${u.prompt_tokens} in / ${u.completion_tokens} out / ${u.total_tokens} total]`)
  }
}
