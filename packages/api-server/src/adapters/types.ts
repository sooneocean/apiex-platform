/**
 * ProviderAdapter — upstream LLM provider 雙向轉換介面
 * T05 (AnthropicAdapter) 和 T06 (GeminiAdapter) 均實作此介面
 */

export interface OpenAIRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  temperature?: number
  max_tokens?: number
  [key: string]: unknown
}

export interface OpenAIResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface OpenAIStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: string; content?: string }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface StreamChunkResult {
  chunk: OpenAIStreamChunk | null  // null = skip (ping, no-op)
  done: boolean                     // true = [DONE] signal
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ProviderAdapter {
  /** Transform OpenAI request to provider-specific format */
  transformRequest(body: OpenAIRequest, upstreamModel: string): unknown

  /** Transform provider response to OpenAI format (non-streaming) */
  transformResponse(response: unknown, model: string): OpenAIResponse

  /** Transform a single provider SSE chunk to OpenAI format (streaming) */
  transformStreamChunk(chunk: { event: string; data: unknown }, model: string): StreamChunkResult

  /** Get provider-specific HTTP headers */
  getHeaders(): Record<string, string>

  /** Get provider-specific base URL */
  getBaseUrl(): string
}
