import { describe, it, expect } from 'vitest'
import { GeminiAdapter } from '../GeminiAdapter.js'
import type { OpenAIRequest } from '../types.js'

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter()

  // ─── transformRequest ───────────────────────────────────────────────────

  it('transformRequest should pass through OpenAI format with model replaced', () => {
    const openaiBody: OpenAIRequest = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }
    const result = adapter.transformRequest(openaiBody, 'gemini-2.0-flash') as Record<string, unknown>

    expect(result.model).toBe('gemini-2.0-flash')
    expect(result.messages).toEqual(openaiBody.messages)
    expect(result.temperature).toBe(0.7)
    expect(result.max_tokens).toBe(1024)
  })

  // ─── transformResponse ──────────────────────────────────────────────────

  it('transformResponse should normalize finish_reason from STOP to stop', () => {
    const geminiResponse = {
      id: 'chatcmpl-abc123',
      object: 'chat.completion',
      created: 1710400000,
      model: 'gemini-2.0-flash',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'STOP',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }

    const result = adapter.transformResponse(geminiResponse, 'gemini-2.0-flash')

    expect(result.choices[0].finish_reason).toBe('stop')
    expect(result.model).toBe('gemini-2.0-flash')
    expect(result.object).toBe('chat.completion')
  })

  it('transformResponse should ensure usage field exists with defaults', () => {
    const geminiResponseNoUsage = {
      id: 'chatcmpl-abc123',
      object: 'chat.completion',
      created: 1710400000,
      model: 'gemini-2.0-flash',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello' },
        finish_reason: 'STOP',
      }],
    }

    const result = adapter.transformResponse(geminiResponseNoUsage, 'gemini-2.0-flash')

    expect(result.usage).toBeDefined()
    expect(result.usage.prompt_tokens).toBe(0)
    expect(result.usage.completion_tokens).toBe(0)
    expect(result.usage.total_tokens).toBe(0)
  })

  // ─── transformStreamChunk ───────────────────────────────────────────────

  it('transformStreamChunk: normal delta should produce OpenAI chunk', () => {
    const event = {
      event: 'data',
      data: JSON.stringify({
        id: 'chatcmpl-xxx',
        object: 'chat.completion.chunk',
        created: 1710400000,
        model: 'gemini-2.0-flash',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
        }],
      }),
    }

    const result = adapter.transformStreamChunk(event, 'gemini-2.0-flash')

    expect(result.done).toBe(false)
    expect(result.chunk).not.toBeNull()
    expect(result.chunk!.object).toBe('chat.completion.chunk')
    expect(result.chunk!.model).toBe('gemini-2.0-flash')
    expect(result.chunk!.choices[0].delta.content).toBe('Hello')
    expect(result.chunk!.choices[0].finish_reason).toBeNull()
  })

  it('transformStreamChunk: DONE signal should set done=true', () => {
    const event = {
      event: 'data',
      data: '[DONE]',
    }

    const result = adapter.transformStreamChunk(event, 'gemini-2.0-flash')

    expect(result.done).toBe(true)
    expect(result.chunk).toBeNull()
  })

  it('transformStreamChunk: should normalize finish_reason in stream chunks', () => {
    const event = {
      event: 'data',
      data: JSON.stringify({
        id: 'chatcmpl-xxx',
        object: 'chat.completion.chunk',
        created: 1710400000,
        model: 'gemini-2.0-flash',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'STOP',
        }],
      }),
    }

    const result = adapter.transformStreamChunk(event, 'gemini-2.0-flash')

    expect(result.done).toBe(false)
    expect(result.chunk).not.toBeNull()
    expect(result.chunk!.choices[0].finish_reason).toBe('stop')
  })
})
