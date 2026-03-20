import type { ProviderAdapter, OpenAIRequest, OpenAIResponse, StreamChunkResult } from './types.js'

/** Raw Gemini response shape (OpenAI-compat endpoint) */
interface GeminiRawResponse {
  id?: string
  created?: number
  choices?: Array<{
    index?: number
    message?: { role?: string; content?: string }
    delta?: { role?: string; content?: string }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * GeminiAdapter — Google Gemini OpenAI 相容層正規化 adapter
 *
 * Google 提供 OpenAI-compatible endpoint，但回應格式有些微差異需正規化：
 * - finish_reason 使用大寫（"STOP" → "stop"）
 * - usage 欄位可能缺失
 * - id 欄位格式確保為 chatcmpl-xxx
 */
export class GeminiAdapter implements ProviderAdapter {
  /**
   * transformRequest: 直接透傳 OpenAI 格式，僅替換 model 為 upstreamModel
   */
  transformRequest(body: OpenAIRequest, upstreamModel: string): unknown {
    return {
      ...body,
      model: upstreamModel,
    }
  }

  /**
   * transformResponse: 正規化 Google 回應至標準 OpenAI 格式
   */
  transformResponse(response: unknown, model: string): OpenAIResponse {
    const res = response as GeminiRawResponse

    const choices = (res.choices ?? []).map((choice) => ({
      index: choice.index ?? 0,
      message: {
        role: choice.message?.role ?? 'assistant',
        content: choice.message?.content ?? '',
      },
      finish_reason: this.normalizeFinishReason(choice.finish_reason ?? 'stop'),
    }))

    const usage = {
      prompt_tokens: res.usage?.prompt_tokens ?? 0,
      completion_tokens: res.usage?.completion_tokens ?? 0,
      total_tokens: res.usage?.total_tokens ?? 0,
    }

    const rawId = res.id ?? `chatcmpl-${Date.now()}`
    const id = rawId.startsWith('chatcmpl-') ? rawId : `chatcmpl-${rawId}`

    return {
      id,
      object: 'chat.completion',
      created: res.created ?? Math.floor(Date.now() / 1000),
      model,
      choices,
      usage,
    }
  }

  /**
   * transformStreamChunk: 處理 Google SSE streaming chunk
   * - data: [DONE] → done=true
   * - 正規化 finish_reason
   * - 處理可能不含 usage 的 chunk
   */
  transformStreamChunk(chunk: { event: string; data: unknown }, model: string): StreamChunkResult {
    // RouterService already JSON.parse'd the data — it arrives as an object, not a string
    const data = chunk.data

    // Handle [DONE] signal (string comparison for safety)
    if (data === '[DONE]' || (typeof data === 'string' && data.trim() === '[DONE]')) {
      return { chunk: null, done: true }
    }

    let parsed: GeminiRawResponse
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data) as GeminiRawResponse
      } catch {
        return { chunk: null, done: false }
      }
    } else {
      parsed = data as GeminiRawResponse
    }

    const choices = (parsed.choices ?? []).map((choice) => ({
      index: choice.index ?? 0,
      delta: {
        role: choice.delta?.role,
        content: choice.delta?.content,
      },
      finish_reason: choice.finish_reason != null
        ? this.normalizeFinishReason(choice.finish_reason)
        : null,
    }))

    const usage = parsed.usage
      ? {
          prompt_tokens: parsed.usage.prompt_tokens ?? 0,
          completion_tokens: parsed.usage.completion_tokens ?? 0,
          total_tokens: parsed.usage.total_tokens ?? 0,
        }
      : undefined

    const rawId = parsed.id ?? `chatcmpl-${Date.now()}`
    const id = rawId.startsWith('chatcmpl-') ? rawId : `chatcmpl-${rawId}`

    return {
      chunk: {
        id,
        object: 'chat.completion.chunk',
        created: parsed.created ?? Math.floor(Date.now() / 1000),
        model,
        choices,
        usage,
      },
      done: false,
      usage,
    }
  }

  /**
   * getHeaders: 回傳 Google AI API 所需標頭
   */
  getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${process.env.GOOGLE_AI_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * getBaseUrl: 回傳 Google Gemini OpenAI 相容層 base URL
   */
  getBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta/openai'
  }

  /**
   * 將 finish_reason 轉為小寫標準格式
   * Google 使用大寫（STOP），OpenAI 使用小寫（stop）
   */
  private normalizeFinishReason(reason: string): string {
    return reason.toLowerCase()
  }
}
