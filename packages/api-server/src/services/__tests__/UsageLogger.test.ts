/**
 * T08 TDD — UsageLogger 測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factory must not reference top-level variables
vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

const { supabaseAdmin } = await import('../../lib/supabase.js')
const { UsageLogger } = await import('../UsageLogger.js')

describe('UsageLogger', () => {
  let logger: InstanceType<typeof UsageLogger>
  const mockInsert = vi.fn()
  const mockSelect = vi.fn()
  const mockSingle = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockResolvedValue({ data: { id: 'log-1' }, error: null })
    mockSelect.mockReturnValue({ single: mockSingle })
    mockInsert.mockReturnValue({ select: mockSelect })

    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
    fromMock.mockReturnValue({ insert: mockInsert })

    logger = new UsageLogger()
  })

  it('should insert a usage log with all required fields', async () => {
    await logger.logUsage({
      apiKeyId: 'key-123',
      modelTag: 'apex-smart',
      upstreamModel: 'claude-opus-4-6',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 1200,
      status: 'success',
    })

    expect(supabaseAdmin.from).toHaveBeenCalledWith('usage_logs')
    expect(mockInsert).toHaveBeenCalledWith({
      api_key_id: 'key-123',
      model_tag: 'apex-smart',
      upstream_model: 'claude-opus-4-6',
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      latency_ms: 1200,
      status: 'success',
    })
  })

  it('should handle error status logs', async () => {
    await logger.logUsage({
      apiKeyId: 'key-456',
      modelTag: 'apex-cheap',
      upstreamModel: 'gemini-2.0-flash',
      promptTokens: 50,
      completionTokens: 0,
      totalTokens: 50,
      latencyMs: 30000,
      status: 'error',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        latency_ms: 30000,
      })
    )
  })

  it('should handle incomplete (streaming interrupted) status', async () => {
    await logger.logUsage({
      apiKeyId: 'key-789',
      modelTag: 'apex-smart',
      upstreamModel: 'claude-opus-4-6',
      promptTokens: 100,
      completionTokens: 25,
      totalTokens: 125,
      latencyMs: 5000,
      status: 'incomplete',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'incomplete',
        completion_tokens: 25,
      })
    )
  })

  it('should not throw on DB error (fire-and-forget logging)', async () => {
    mockSingle.mockRejectedValueOnce(new Error('DB error'))

    await expect(
      logger.logUsage({
        apiKeyId: 'key-err',
        modelTag: 'apex-smart',
        upstreamModel: 'claude-opus-4-6',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        status: 'error',
      })
    ).resolves.not.toThrow()
  })
})
