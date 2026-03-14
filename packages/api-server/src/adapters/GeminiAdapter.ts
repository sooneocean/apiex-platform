import type { ProviderAdapter, OpenAIRequest, OpenAIResponse, StreamChunkResult } from './types.js'

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
    const res = response as Record<string, unknown>

    const rawChoices = (res.choices ?? []) as Array<Record<string, unknown>>
    const choices = rawChoices.map((choice) => {
      const rawMessage = (choice.message ?? {}) as Record<string, unknown>
      const rawFinishReason = (choice.finish_reason as string) ?? 'stop'

      return {
        index: (choice.index as number) ?? 0,
        message: {
          role: (rawMessage.role as string) ?? 'assistant',
          content: (rawMessage.content as string) ?? '',
        },
        finish_reason: this.normalizeFinishReason(rawFinishReason),
      }
    })

    const rawUsage = res.usage as Record<string, number> | undefined
    const usage = {
      prompt_tokens: rawUsage?.prompt_tokens ?? 0,
      completion_tokens: rawUsage?.completion_tokens ?? 0,
      total_tokens: rawUsage?.total_tokens ?? 0,
    }

    const rawId = (res.id as string) ?? `chatcmpl-${Date.now()}`
    const id = rawId.startsWith('chatcmpl-') ? rawId : `chatcmpl-${rawId}`

    return {
      id,
      object: 'chat.completion',
      created: (res.created as number) ?? Math.floor(Date.now() / 1000),
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

    let parsed: Record<string, unknown>
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data) as Record<string, unknown>
      } catch {
        return { chunk: null, done: false }
      }
    } else {
      parsed = data as Record<string, unknown>
    }

    const rawChoices = (parsed.choices ?? []) as Array<Record<string, unknown>>
    const choices = rawChoices.map((choice) => {
      const rawDelta = (choice.delta ?? {}) as Record<string, unknown>
      const rawFinishReason = choice.finish_reason as string | null

      return {
        index: (choice.index as number) ?? 0,
        delta: {
          role: rawDelta.role as string | undefined,
          content: rawDelta.content as string | undefined,
        },
        finish_reason: rawFinishReason !== null && rawFinishReason !== undefined
          ? this.normalizeFinishReason(rawFinishReason)
          : null,
      }
    })

    const rawUsage = parsed.usage as Record<string, number> | undefined
    const usage = rawUsage
      ? {
          prompt_tokens: rawUsage.prompt_tokens ?? 0,
          completion_tokens: rawUsage.completion_tokens ?? 0,
          total_tokens: rawUsage.total_tokens ?? 0,
        }
      : undefined

    const rawId = (parsed.id as string) ?? `chatcmpl-${Date.now()}`
    const id = rawId.startsWith('chatcmpl-') ? rawId : `chatcmpl-${rawId}`

    return {
      chunk: {
        id,
        object: 'chat.completion.chunk',
        created: (parsed.created as number) ?? Math.floor(Date.now() / 1000),
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
