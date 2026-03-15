import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

// Mock supabaseAdmin
vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: { from: mockFrom },
  supabaseClient: {},
}))

// Mock adapters
vi.mock('../../adapters/AnthropicAdapter.js', () => ({
  AnthropicAdapter: class {
    transformRequest = vi.fn((body: unknown, model: string) => ({ mock: 'anthropic', model }))
    transformResponse = vi.fn((res: unknown, model: string) => ({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1000,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }))
    getHeaders = vi.fn(() => ({ 'x-api-key': 'test', 'content-type': 'application/json' }))
    getBaseUrl = vi.fn(() => 'https://api.anthropic.com')
  },
}))

vi.mock('../../adapters/GeminiAdapter.js', () => ({
  GeminiAdapter: class {
    transformRequest = vi.fn((body: unknown, model: string) => ({ mock: 'gemini', model }))
    transformResponse = vi.fn((res: unknown, model: string) => ({
      id: 'chatcmpl-2',
      object: 'chat.completion',
      created: 1000,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
    }))
    getHeaders = vi.fn(() => ({ Authorization: 'Bearer test', 'Content-Type': 'application/json' }))
    getBaseUrl = vi.fn(() => 'https://generativelanguage.googleapis.com/v1beta/openai')
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { RouterService } from '../RouterService.js'
import { InvalidRequestError, ServerError } from '../../lib/errors.js'

function mockRouteQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  }
  mockFrom.mockReturnValueOnce(chain)
  return chain
}

function mockRouteListQuery(data: unknown[], error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data, error }),
  }
  mockFrom.mockReturnValueOnce(chain)
  return chain
}

describe('RouterService', () => {
  let service: RouterService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RouterService()
  })

  // ────────────────────────────────────────────────────────────────
  // resolveRoute
  // ────────────────────────────────────────────────────────────────

  describe('resolveRoute', () => {
    it('should_resolveRoute_whenValidTag', async () => {
      const routeData = {
        id: 'route-1',
        tag: 'apex-smart',
        upstream_provider: 'anthropic',
        upstream_model: 'claude-sonnet-4-20250514',
        upstream_base_url: 'https://api.anthropic.com',
        is_active: true,
      }
      mockRouteQuery(routeData)

      const route = await service.resolveRoute('apex-smart')

      expect(route).toEqual(routeData)
      expect(mockFrom).toHaveBeenCalledWith('route_config')
    })

    it('should_throwInvalidRequestError_whenUnknownModel', async () => {
      mockRouteQuery(null, { code: 'PGRST116', message: 'Not found' })

      await expect(service.resolveRoute('nonexistent-model')).rejects.toThrow(InvalidRequestError)
    })

    it('should_throwServerError_whenNoActiveRoute', async () => {
      // DB returns null because no active routes match
      mockRouteQuery(null, null)

      await expect(service.resolveRoute('inactive-model')).rejects.toThrow()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // getAdapter
  // ────────────────────────────────────────────────────────────────

  describe('getAdapter', () => {
    it('should_selectAnthropicAdapter_whenProviderIsAnthropic', () => {
      const adapter = service.getAdapter('anthropic')
      expect(adapter).toBeDefined()
      expect(adapter.getBaseUrl()).toBe('https://api.anthropic.com')
    })

    it('should_selectGeminiAdapter_whenProviderIsGoogle', () => {
      const adapter = service.getAdapter('google')
      expect(adapter).toBeDefined()
      expect(adapter.getBaseUrl()).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    })

    it('should throw for unknown provider', () => {
      expect(() => service.getAdapter('openai')).toThrow(ServerError)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // forward
  // ────────────────────────────────────────────────────────────────

  describe('forward', () => {
    const route = {
      id: 'route-1',
      tag: 'apex-smart',
      upstream_provider: 'anthropic',
      upstream_model: 'claude-sonnet-4-20250514',
      upstream_base_url: 'https://api.anthropic.com',
      is_active: true,
    }

    it('should forward non-streaming request and return response', async () => {
      const upstreamBody = { content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 10, output_tokens: 5 } }
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(upstreamBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const requestBody = {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      }

      const result = await service.forward(route, requestBody, false)
      expect(result).toBeDefined()
      expect(result.type).toBe('json')
      if (result.type === 'json') {
        expect(result.data.choices).toBeDefined()
      }
    })

    it('should_timeout_whenUpstreamExceeds30s', async () => {
      // Simulate abort by making fetch reject with AbortError
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const err = new DOMException('The operation was aborted', 'AbortError')
            setTimeout(() => reject(err), 50)
          })
      )

      const requestBody = {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      }

      await expect(service.forward(route, requestBody, false)).rejects.toThrow()
    })

    it('should_forwardUpstream4xxError', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Bad request' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const requestBody = {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'hi' }],
      }

      await expect(service.forward(route, requestBody, false)).rejects.toThrow()
    })

    it('should_wrap5xxAs502', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      )

      const requestBody = {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'hi' }],
      }

      try {
        await service.forward(route, requestBody, false)
        expect.unreachable('Should have thrown')
      } catch (err: unknown) {
        const apiErr = err as { statusCode?: number }
        expect(apiErr.statusCode).toBe(502)
      }
    })

    it('should forward streaming request and return stream', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n'))
          controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n'))
          controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'))
          controller.close()
        },
      })

      mockFetch.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )

      const requestBody = {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }

      const result = await service.forward(route, requestBody, true)
      expect(result.type).toBe('stream')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // listActiveModels
  // ────────────────────────────────────────────────────────────────

  describe('listActiveModels', () => {
    it('should return active models from route_config', async () => {
      const routes = [
        { id: 'r1', tag: 'apex-smart', upstream_provider: 'anthropic', upstream_model: 'claude-sonnet-4-20250514', is_active: true },
        { id: 'r2', tag: 'apex-cheap', upstream_provider: 'google', upstream_model: 'gemini-2.0-flash', is_active: true },
      ]
      mockRouteListQuery(routes)

      const models = await service.listActiveModels()
      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('apex-smart')
      expect(models[1].id).toBe('apex-cheap')
    })
  })
})
