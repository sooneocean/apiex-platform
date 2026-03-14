import { describe, it, expect } from 'vitest'
import { AnthropicAdapter } from '../AnthropicAdapter.js'
import type { OpenAIRequest } from '../types.js'

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter()

  // ─── transformRequest ───────────────────────────────────────────────────

  it('transformRequest should extract system message as separate parameter', () => {
    const openaiBody: OpenAIRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
    }
    const result = adapter.transformRequest(openaiBody, 'claude-opus-4-5') as Record<string, unknown>

    expect(result.system).toBe('You are helpful.')
    expect(result.model).toBe('claude-opus-4-5')
    expect(result.max_tokens).toBe(4096)
    // system role message should be removed
    const messages = result.messages as Array<{ role: string; content: string }>
    expect(messages.every((m) => m.role !== 'system')).toBe(true)
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
  })

  // ─── transformResponse ──────────────────────────────────────────────────

  it('transformResponse should convert Anthropic Messages response to OpenAI ChatCompletion format', () => {
    const anthropicResponse = {
      id: 'msg_xxx',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' }],
      model: 'claude-opus-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 8 },
    }

    const result = adapter.transformResponse(anthropicResponse, 'claude-opus-4-5')

    expect(result.id).toBe('msg_xxx')
    expect(result.object).toBe('chat.completion')
    expect(typeof result.created).toBe('number')
    expect(result.model).toBe('claude-opus-4-5')
    expect(result.choices).toHaveLength(1)
    expect(result.choices[0].message.role).toBe('assistant')
    expect(result.choices[0].message.content).toBe('Hello')
    expect(result.choices[0].finish_reason).toBe('stop')
    expect(result.usage.prompt_tokens).toBe(12)
    expect(result.usage.completion_tokens).toBe(8)
    expect(result.usage.total_tokens).toBe(20)
  })

  // ─── transformStreamChunk ───────────────────────────────────────────────

  it('transformStreamChunk: message_start should extract prompt_tokens without producing OpenAI chunk', () => {
    const event = {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: { id: 'msg_xxx', model: 'claude-opus-4-5', usage: { input_tokens: 12 } },
      },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).toBeNull()
    expect(result.done).toBe(false)
    expect(result.usage?.prompt_tokens).toBe(12)
  })

  it('transformStreamChunk: content_block_start should initialize delta (no output)', () => {
    const event = {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).toBeNull()
    expect(result.done).toBe(false)
  })

  it('transformStreamChunk: content_block_delta should produce OpenAI delta.content chunk', () => {
    const event = {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).not.toBeNull()
    expect(result.done).toBe(false)
    expect(result.chunk!.object).toBe('chat.completion.chunk')
    expect(result.chunk!.model).toBe('claude-opus-4-5')
    expect(result.chunk!.choices[0].delta.content).toBe('Hello')
    expect(result.chunk!.choices[0].finish_reason).toBeNull()
  })

  it('transformStreamChunk: content_block_stop should be no-op (no output)', () => {
    const event = {
      event: 'content_block_stop',
      data: { type: 'content_block_stop', index: 0 },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).toBeNull()
    expect(result.done).toBe(false)
  })

  it('transformStreamChunk: message_delta should extract output_tokens and usage', () => {
    const event = {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 8 },
      },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).toBeNull()
    expect(result.done).toBe(false)
    expect(result.usage?.completion_tokens).toBe(8)
  })

  it('transformStreamChunk: message_stop should produce DONE signal', () => {
    const event = {
      event: 'message_stop',
      data: { type: 'message_stop' },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.done).toBe(true)
  })

  it('transformStreamChunk: ping should be ignored (no output, no error)', () => {
    const event = {
      event: 'ping',
      data: { type: 'ping' },
    }
    const result = adapter.transformStreamChunk(event, 'claude-opus-4-5')

    expect(result.chunk).toBeNull()
    expect(result.done).toBe(false)
  })

  it('transformStreamChunk: error should convert to OpenAI error event format', () => {
    const event = {
      event: 'error',
      data: {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      },
    }

    expect(() => adapter.transformStreamChunk(event, 'claude-opus-4-5')).toThrow('Overloaded')
  })
})
