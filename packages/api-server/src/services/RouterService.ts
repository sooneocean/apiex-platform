import { supabaseAdmin } from '../lib/supabase.js'
import { InvalidRequestError, ServerError, ApiError } from '../lib/errors.js'
import { AnthropicAdapter } from '../adapters/AnthropicAdapter.js'
import { GeminiAdapter } from '../adapters/GeminiAdapter.js'
import type { ProviderAdapter, OpenAIRequest, OpenAIResponse, StreamChunkResult } from '../adapters/types.js'

export interface RouteRecord {
  id: string
  tag: string
  upstream_provider: string
  upstream_model: string
  upstream_base_url: string
  is_active: boolean
}

export interface ForwardResultJson {
  type: 'json'
  data: OpenAIResponse
}

export interface ForwardResultStream {
  type: 'stream'
  stream: ReadableStream<Uint8Array>
  /** Accumulated usage — populated after stream parsing; may be partial until done. */
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export type ForwardResult = ForwardResultJson | ForwardResultStream

/** Timeout for non-streaming requests (ms) */
const NON_STREAM_TIMEOUT = 30_000
/** Timeout for streaming requests (ms) */
const STREAM_TIMEOUT = 120_000

export class RouterService {
  private adapters: Record<string, ProviderAdapter>

  constructor() {
    this.adapters = {
      anthropic: new AnthropicAdapter(),
      google: new GeminiAdapter(),
    }
  }

  /**
   * Resolve a model tag to all active route_config records, sorted by priority (asc).
   * Used for fallback: if the first route fails, try the next.
   */
  async resolveRoutes(modelTag: string): Promise<RouteRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('route_config')
      .select('*')
      .eq('tag', modelTag)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (error || !data || data.length === 0) {
      throw new InvalidRequestError(
        `Model '${modelTag}' is not supported. Valid values: apex-smart, apex-cheap.`
      )
    }

    return data as RouteRecord[]
  }

  /**
   * Resolve a model tag to a single route_config record (first by priority).
   * Backwards-compatible wrapper around resolveRoutes().
   */
  async resolveRoute(modelTag: string): Promise<RouteRecord> {
    const routes = await this.resolveRoutes(modelTag)
    return routes[0]
  }

  /**
   * Get the adapter for a given upstream provider.
   */
  getAdapter(provider: string): ProviderAdapter {
    const adapter = this.adapters[provider]
    if (!adapter) {
      throw new ServerError(`No adapter configured for provider: ${provider}`, 'route_not_configured')
    }
    return adapter
  }

  /**
   * Forward a request to the upstream provider.
   * - Non-streaming: returns JSON response
   * - Streaming: returns a ReadableStream of SSE chunks (already transformed to OpenAI format)
   */
  async forward(
    route: RouteRecord,
    requestBody: OpenAIRequest,
    stream: boolean
  ): Promise<ForwardResult> {
    const adapter = this.getAdapter(route.upstream_provider)
    const transformedBody = adapter.transformRequest(requestBody, route.upstream_model)

    const timeout = stream ? STREAM_TIMEOUT : NON_STREAM_TIMEOUT
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      // Determine the endpoint URL
      const baseUrl = route.upstream_base_url || adapter.getBaseUrl()
      const isAnthropic = route.upstream_provider === 'anthropic'
      const endpoint = isAnthropic
        ? `${baseUrl}/v1/messages`
        : `${baseUrl}/chat/completions`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: adapter.getHeaders(),
        body: JSON.stringify(transformedBody),
        signal: controller.signal,
      })

      clearTimeout(timer)

      // Handle errors
      if (!response.ok) {
        const status = response.status
        let errorDetail: string

        try {
          const errorBody = await response.json() as { error?: { message?: string } }
          errorDetail = errorBody?.error?.message ?? `Upstream returned ${status}`
        } catch {
          errorDetail = `Upstream returned ${status}`
        }

        if (status >= 400 && status < 500) {
          throw new ApiError(errorDetail, status, 'upstream_error', 'upstream_error')
        }
        // 5xx → wrap as 502
        throw new ApiError(errorDetail, 502, 'server_error', 'upstream_error')
      }

      if (!stream) {
        // Non-streaming: parse JSON and transform
        const rawBody = await response.json()
        const transformed = adapter.transformResponse(rawBody, route.tag)
        return { type: 'json', data: transformed }
      }

      // Streaming: pipe upstream SSE through adapter transform
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      const upstreamBody = response.body
      if (!upstreamBody) {
        throw new ServerError('Upstream returned empty body for streaming request')
      }

      const transformedStream = this.createTransformedSSEStream(
        upstreamBody,
        adapter,
        route.tag,
        usage
      )

      return { type: 'stream', stream: transformedStream, usage }
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError('Upstream service timed out.', 502, 'server_error', 'upstream_timeout')
      }
      throw err
    }
  }

  /**
   * List all active models from route_config.
   * Returns OpenAI-format model objects.
   */
  async listActiveModels(): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> {
    const { data, error } = await supabaseAdmin
      .from('route_config')
      .select('*')
      .eq('is_active', true)

    if (error || !data) {
      return []
    }

    return (data as RouteRecord[]).map((r) => ({
      id: r.tag,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'apiex',
    }))
  }

  /**
   * Create a TransformStream that converts upstream SSE into OpenAI-format SSE.
   */
  private createTransformedSSEStream(
    upstream: ReadableStream<Uint8Array>,
    adapter: ProviderAdapter,
    modelTag: string,
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  ): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ''

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? '' // Keep incomplete line in buffer

            let currentEvent = ''
            let currentData = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                currentData = line.slice(6)
              } else if (line === '') {
                // End of SSE message
                if (currentData) {
                  // Check for [DONE] signal
                  if (currentData.trim() === '[DONE]') {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                    currentEvent = ''
                    currentData = ''
                    continue
                  }

                  try {
                    const parsed = JSON.parse(currentData)
                    const result: StreamChunkResult = adapter.transformStreamChunk(
                      { event: currentEvent || 'data', data: parsed },
                      modelTag
                    )

                    // Accumulate usage
                    if (result.usage) {
                      usage.prompt_tokens += result.usage.prompt_tokens
                      usage.completion_tokens += result.usage.completion_tokens
                      usage.total_tokens += result.usage.total_tokens
                    }

                    if (result.chunk) {
                      const sseData = `data: ${JSON.stringify(result.chunk)}\n\n`
                      controller.enqueue(encoder.encode(sseData))
                    }

                    if (result.done) {
                      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                    }
                  } catch {
                    // Skip unparseable chunks
                  }
                }
                currentEvent = ''
                currentData = ''
              }
            }
          }
        } catch (err) {
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })
  }
}
