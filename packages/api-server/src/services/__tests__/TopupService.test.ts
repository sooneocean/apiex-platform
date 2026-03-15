import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock stripe before imports
const mockConstructEvent = vi.fn()
const mockCheckoutSessionsCreate = vi.fn()

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: mockCheckoutSessionsCreate,
        },
      },
      webhooks: {
        constructEvent: mockConstructEvent,
      },
    })),
  }
})

// Mock supabaseAdmin before imports
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

vi.mock('../../lib/supabase.js', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
    supabaseClient: {},
  }
})

vi.mock('../../lib/stripe.js', () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
}))

import { supabaseAdmin } from '../../lib/supabase.js'
import { TopupService } from '../TopupService.js'

// ── helpers ────────────────────────────────────────────────────────────────

function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return chain
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('TopupService', () => {
  let service: TopupService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new TopupService()
  })

  // ─────────────────────────────────────────────────────────────────
  // 1. createCheckoutSession — success
  // ─────────────────────────────────────────────────────────────────
  describe('createCheckoutSession', () => {
    it('createCheckoutSession_success: returns checkout_url and session_id for valid plan', async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: 'https://checkout.stripe.com/pay/cs_test_abc123',
        id: 'cs_test_abc123',
      })

      const result = await service.createCheckoutSession('user-uuid-1', 'plan_10')

      expect(result).toEqual({
        checkout_url: 'https://checkout.stripe.com/pay/cs_test_abc123',
        session_id: 'cs_test_abc123',
      })

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          metadata: expect.objectContaining({
            user_id: 'user-uuid-1',
            plan_id: 'plan_10',
            tokens_granted: '1000000',
          }),
        })
      )
    })

    // ─────────────────────────────────────────────────────────────
    // 2. createCheckoutSession — invalid plan
    // ─────────────────────────────────────────────────────────────
    it('createCheckoutSession_invalidPlan: throws error for unknown plan_id', async () => {
      await expect(
        service.createCheckoutSession('user-uuid-1', 'plan_999')
      ).rejects.toThrow(/invalid plan/i)

      // Stripe should NOT be called when plan is invalid
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // 3. handleWebhookEvent — success (with quota accumulation)
  // ─────────────────────────────────────────────────────────────────
  describe('handleWebhookEvent', () => {
    it('handleWebhookEvent_success: inserts topup_log and adds quota on checkout.session.completed', async () => {
      const fakeEvent = {
        type: 'checkout.session.completed',
        id: 'evt_test_001',
        data: {
          object: {
            id: 'cs_test_abc123',
            metadata: {
              user_id: 'user-uuid-1',
              plan_id: 'plan_10',
              tokens_granted: '1000000',
            },
            amount_total: 1000,
          },
        },
      }
      mockConstructEvent.mockReturnValueOnce(fakeEvent)

      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>

      // 1st call: INSERT topup_logs
      const insertChain = buildChain({
        single: vi.fn().mockResolvedValue({ data: { id: 'log-1' }, error: null }),
      })

      // 2nd call: UPSERT user_quotas
      const upsertQuotaChain = buildChain({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })

      // 3rd call: UPDATE api_keys
      const updateKeysChain = buildChain({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      fromMock
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(upsertQuotaChain)
        .mockReturnValueOnce(updateKeysChain)

      await expect(
        service.handleWebhookEvent('raw-body', 'stripe-sig-valid')
      ).resolves.toBeUndefined()

      // topup_logs INSERT
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid-1',
          stripe_session_id: 'cs_test_abc123',
          stripe_event_id: 'evt_test_001',
          tokens_granted: 1000000,
        })
      )

      // user_quotas UPSERT
      expect(upsertQuotaChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid-1',
        })
      )

      // api_keys UPDATE
      expect(updateKeysChain.update).toHaveBeenCalledWith(
        expect.objectContaining({})
      )
      expect(updateKeysChain.eq).toHaveBeenCalledWith('user_id', 'user-uuid-1')
    })

    // ─────────────────────────────────────────────────────────────
    // 4. handleWebhookEvent — idempotent (23505 duplicate)
    // ─────────────────────────────────────────────────────────────
    it('handleWebhookEvent_idempotent: handles 23505 unique violation gracefully without re-adding quota', async () => {
      const fakeEvent = {
        type: 'checkout.session.completed',
        id: 'evt_duplicate_001',
        data: {
          object: {
            id: 'cs_test_dup',
            metadata: {
              user_id: 'user-uuid-2',
              plan_id: 'plan_5',
              tokens_granted: '500000',
            },
            amount_total: 500,
          },
        },
      }
      mockConstructEvent.mockReturnValueOnce(fakeEvent)

      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>

      // INSERT returns 23505 unique violation
      const insertChain = buildChain({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        }),
      })
      fromMock.mockReturnValueOnce(insertChain)

      // Should resolve without throwing — idempotent success
      await expect(
        service.handleWebhookEvent('raw-body', 'stripe-sig-dup')
      ).resolves.toBeUndefined()

      // Quota should NOT be updated on duplicate
      expect(fromMock).toHaveBeenCalledTimes(1) // only the INSERT, no quota update calls
    })

    // ─────────────────────────────────────────────────────────────
    // 5. handleWebhookEvent — invalid signature
    // ─────────────────────────────────────────────────────────────
    it('handleWebhookEvent_invalidSignature: throws on invalid Stripe signature', async () => {
      mockConstructEvent.mockImplementationOnce(() => {
        throw new Error('No signatures found matching the expected signature for payload')
      })

      await expect(
        service.handleWebhookEvent('raw-body', 'bad-signature')
      ).rejects.toThrow()

      // supabase should never be called
      expect(supabaseAdmin.from).not.toHaveBeenCalled()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // 6. getTopupStatus — completed
  // ─────────────────────────────────────────────────────────────────
  describe('getTopupStatus', () => {
    it('getTopupStatus_completed: returns status=completed with tokens_granted when log exists', async () => {
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const selectChain = buildChain({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'log-1',
            stripe_session_id: 'cs_test_completed',
            tokens_granted: 1000000,
            created_at: '2026-03-15T10:00:00Z',
            status: 'completed',
          },
          error: null,
        }),
      })
      fromMock.mockReturnValueOnce(selectChain)

      const result = await service.getTopupStatus('cs_test_completed')

      expect(result.status).toBe('completed')
      expect(result.tokens_granted).toBe(1000000)
      expect(result.completed_at).toBe('2026-03-15T10:00:00Z')
    })

    // ─────────────────────────────────────────────────────────────
    // 7. getTopupStatus — pending
    // ─────────────────────────────────────────────────────────────
    it('getTopupStatus_pending: returns status=pending when no log found', async () => {
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const selectChain = buildChain({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Row not found' },
        }),
      })
      fromMock.mockReturnValueOnce(selectChain)

      const result = await service.getTopupStatus('cs_test_pending')

      expect(result.status).toBe('pending')
      expect(result.tokens_granted).toBeUndefined()
      expect(result.completed_at).toBeUndefined()
    })
  })
})
