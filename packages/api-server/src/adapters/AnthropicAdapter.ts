import type {
  ProviderAdapter,
  OpenAIRequest,
  OpenAIResponse,
  StreamChunkResult,
} from './types.js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

/**
 * Map Anthropic stop_reason to OpenAI finish_reason.
 * Anthropic: end_turn, max_tokens, stop_sequence, tool_use
 * OpenAI:    stop,     length,     stop,           tool_calls
 */
const FINISH_REASON_MAP: Record<string, string> = {
  'end_turn': 'stop',
  'max_tokens': 'length',
  'stop_sequence': 'stop',
  'tool_use': 'tool_calls',
}

function mapFinishReason(reason: string): string {
  return FINISH_REASON_MAP[reason] ?? 'stop'
}

export class AnthropicAdapter implements ProviderAdapter {
  transformRequest(body: OpenAIRequest, upstreamModel: string): unknown {
    const messages = body.messages ?? []

    // Extract system message(s) and build the system string
    const systemMessages = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')

    // Remove system messages from the array
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const result: Record<string, unknown> = {
      model: upstreamModel,
      messages: nonSystemMessages,
      max_tokens: body.max_tokens ?? 4096,
    }

    if (systemMessages.length > 0) {
      result.system = systemMessages
    }

    if (body.temperature !== undefined) {
      result.temperature = body.temperature
    }

    if (body.stream !== undefined) {
      result.stream = body.stream
    }

    return result
  }

  transformResponse(response: unknown, model: string): OpenAIResponse {
    const res = response as {
      id: string
      content: Array<{ type: string; text: string }>
      stop_reason: string
      usage: { input_tokens: number; output_tokens: number }
    }

    const textContent = res.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')

    return {
      id: res.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: textContent },
          finish_reason: mapFinishReason(res.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens,
      },
    }
  }

  transformStreamChunk(
    chunk: { event: string; data: unknown },
    model: string
  ): StreamChunkResult {
    const data = chunk.data as Record<string, unknown>
    const eventType = chunk.event

    switch (eventType) {
      case 'message_start': {
        const message = data.message as { usage?: { input_tokens?: number } }
        const inputTokens = message?.usage?.input_tokens ?? 0
        return {
          chunk: null,
          done: false,
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: 0,
            total_tokens: inputTokens,
          },
        }
      }

      case 'content_block_start': {
        // Initialize delta — no output chunk needed
        return { chunk: null, done: false }
      }

      case 'content_block_delta': {
        const delta = data.delta as { type: string; text?: string }
        const text = delta?.text ?? ''
        return {
          chunk: {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { content: text },
                finish_reason: null,
              },
            ],
          },
          done: false,
        }
      }

      case 'content_block_stop': {
        // No-op
        return { chunk: null, done: false }
      }

      case 'message_delta': {
        const usage = data.usage as { output_tokens?: number }
        const outputTokens = usage?.output_tokens ?? 0
        return {
          chunk: null,
          done: false,
          usage: {
            prompt_tokens: 0,
            completion_tokens: outputTokens,
            total_tokens: outputTokens,
          },
        }
      }

      case 'message_stop': {
        return { chunk: null, done: true }
      }

      case 'ping': {
        // Keep-alive — ignore
        return { chunk: null, done: false }
      }

      case 'error': {
        const error = data.error as { type?: string; message?: string }
        throw new Error(error?.message ?? 'Anthropic stream error')
      }

      default: {
        // Unknown event — ignore safely
        return { chunk: null, done: false }
      }
    }
  }

  getHeaders(): Record<string, string> {
    return {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }
  }

  getBaseUrl(): string {
    return 'https://api.anthropic.com'
  }
}
