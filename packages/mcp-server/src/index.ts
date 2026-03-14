#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { getApiKey, getBaseUrl } from './lib/config.js'

async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const baseUrl = getBaseUrl()
  const apiKey = getApiKey()
  const url = `${baseUrl}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

const server = new McpServer({
  name: 'apiex',
  version: '0.1.0',
})

// Tool: apiex_chat
server.tool(
  'apiex_chat',
  'Send a chat completion request through Apiex. Routes to the best available AI model based on the model tag.',
  {
    model: z.string().describe('Model routing tag (e.g. apex-smart, apex-cheap)'),
    messages: z.array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    ).describe('Chat messages'),
  },
  async ({ model, messages }) => {
    const data = await apiRequest<{
      choices: Array<{ message: { content: string } }>
    }>('POST', '/v1/chat/completions', { model, messages })

    const content = data.choices?.[0]?.message?.content ?? '(no response)'
    return { content: [{ type: 'text' as const, text: content }] }
  }
)

// Tool: apiex_models
server.tool(
  'apiex_models',
  'List available models on Apiex.',
  {},
  async () => {
    const data = await apiRequest<{ data: Array<{ id: string; owned_by?: string }> }>(
      'GET',
      '/v1/models'
    )
    const text = data.data
      .map((m) => `${m.id}${m.owned_by ? ` (${m.owned_by})` : ''}`)
      .join('\n')
    return { content: [{ type: 'text' as const, text: text || '(no models)' }] }
  }
)

// Tool: apiex_usage
server.tool(
  'apiex_usage',
  'Get usage summary from Apiex.',
  {
    period: z.string().optional().describe('Usage period filter (e.g. "7d", "30d")'),
  },
  async ({ period }) => {
    const query = period ? `?period=${encodeURIComponent(period)}` : ''
    const data = await apiRequest<{
      totalRequests: number
      totalTokens: number
      period: string
    }>('GET', `/usage/summary${query}`)
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP Server error:', err)
  process.exit(1)
})
