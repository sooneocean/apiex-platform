/**
 * RatesService unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

const { supabaseAdmin } = await import('../../lib/supabase.js')
const { RatesService } = await import('../RatesService.js')

describe('RatesService', () => {
  let svc: InstanceType<typeof RatesService>

  const mockSingle = vi.fn()
  const mockLimit = vi.fn()
  const mockLte = vi.fn()
  const mockOrder2 = vi.fn()
  const mockEq = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockSelect = vi.fn()
  const mockOrder = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new RatesService()

    // Chain defaults
    mockSingle.mockResolvedValue({ data: null, error: null })
    mockLimit.mockReturnValue({ single: mockSingle })
    mockOrder2.mockReturnValue({ limit: mockLimit })
    mockLte.mockReturnValue({ order: mockOrder2 })
    mockEq.mockReturnValue({ lte: mockLte, order: mockOrder, single: mockSingle })
    mockOrder.mockReturnValue({ single: mockSingle })

    const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
    fromMock.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    })
  })

  describe('listRates', () => {
    it('should return all rates sorted by model_tag asc and effective_from desc', async () => {
      const fakeRates = [
        { id: '1', model_tag: 'apex-cheap', input_rate_per_1k: 0.0001, output_rate_per_1k: 0.0004, effective_from: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z' },
        { id: '2', model_tag: 'apex-smart', input_rate_per_1k: 0.015, output_rate_per_1k: 0.075, effective_from: '2024-01-01T00:00:00Z', created_at: '2024-01-01T00:00:00Z' },
      ]

      const mockOrder3 = vi.fn().mockResolvedValue({ data: fakeRates, error: null })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder3 })
      mockSelect.mockReturnValue({ order: mockOrder1 })

      const result = await svc.listRates()

      expect(result).toEqual(fakeRates)
      expect(supabaseAdmin.from).toHaveBeenCalledWith('model_rates')
    })

    it('should throw on DB error', async () => {
      const mockOrderErr = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      })
      mockSelect.mockReturnValue({ order: mockOrderErr })

      await expect(svc.listRates()).rejects.toThrow('listRates failed')
    })
  })

  describe('createRate', () => {
    it('should insert a new rate and return it', async () => {
      const newRate = {
        id: 'uuid-123',
        model_tag: 'apex-smart',
        input_rate_per_1k: 0.02,
        output_rate_per_1k: 0.08,
        effective_from: '2026-03-15T00:00:00Z',
        created_at: '2026-03-15T00:00:00Z',
      }

      const mockSelectInsert = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: newRate, error: null }) })
      mockInsert.mockReturnValue({ select: mockSelectInsert })

      const result = await svc.createRate({
        model_tag: 'apex-smart',
        input_rate_per_1k: 0.02,
        output_rate_per_1k: 0.08,
        effective_from: '2026-03-15T00:00:00Z',
      })

      expect(result).toEqual(newRate)
      expect(supabaseAdmin.from).toHaveBeenCalledWith('model_rates')
    })

    it('should insert without effective_from (defaults to now())', async () => {
      const mockSelectInsert = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'x', model_tag: 'apex-cheap', input_rate_per_1k: 0.0001, output_rate_per_1k: 0.0004, effective_from: '2026-03-15T00:00:00Z', created_at: '2026-03-15T00:00:00Z' },
          error: null,
        }),
      })
      mockInsert.mockReturnValue({ select: mockSelectInsert })

      const result = await svc.createRate({
        model_tag: 'apex-cheap',
        input_rate_per_1k: 0.0001,
        output_rate_per_1k: 0.0004,
      })

      expect(result.model_tag).toBe('apex-cheap')
      // effective_from not passed in insert call data
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.effective_from).toBeUndefined()
    })
  })

  describe('updateRate', () => {
    it('should update a rate by id', async () => {
      const updatedRate = {
        id: 'uuid-123',
        model_tag: 'apex-smart',
        input_rate_per_1k: 0.03,
        output_rate_per_1k: 0.1,
        effective_from: '2026-03-15T00:00:00Z',
        created_at: '2026-03-15T00:00:00Z',
      }

      const mockSelectUpdate = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: updatedRate, error: null }) })
      const mockEqUpdate = vi.fn().mockReturnValue({ select: mockSelectUpdate })
      mockUpdate.mockReturnValue({ eq: mockEqUpdate })

      const result = await svc.updateRate('uuid-123', { input_rate_per_1k: 0.03, output_rate_per_1k: 0.1 })

      expect(result).toEqual(updatedRate)
    })

    it('should throw not_found when record does not exist', async () => {
      const mockSelectUpdate = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })
      const mockEqUpdate = vi.fn().mockReturnValue({ select: mockSelectUpdate })
      mockUpdate.mockReturnValue({ eq: mockEqUpdate })

      await expect(svc.updateRate('nonexistent', {})).rejects.toThrow('not_found')
    })
  })

  describe('getEffectiveRate', () => {
    it('should return the most recent rate at or before asOfDate', async () => {
      const rate = {
        id: 'rate-1',
        model_tag: 'apex-smart',
        input_rate_per_1k: 0.015,
        output_rate_per_1k: 0.075,
        effective_from: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      }

      mockSingle.mockResolvedValue({ data: rate, error: null })
      mockLimit.mockReturnValue({ single: mockSingle })
      mockOrder2.mockReturnValue({ limit: mockLimit })
      mockLte.mockReturnValue({ order: mockOrder2 })
      mockEq.mockReturnValue({ lte: mockLte })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await svc.getEffectiveRate('apex-smart', '2026-01-01T00:00:00Z')

      expect(result).toEqual(rate)
      expect(supabaseAdmin.from).toHaveBeenCalledWith('model_rates')
    })

    it('should return null when no rate exists (PGRST116)', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
      mockLimit.mockReturnValue({ single: mockSingle })
      mockOrder2.mockReturnValue({ limit: mockLimit })
      mockLte.mockReturnValue({ order: mockOrder2 })
      mockEq.mockReturnValue({ lte: mockLte })
      mockSelect.mockReturnValue({ eq: mockEq })

      const result = await svc.getEffectiveRate('apex-nonexistent', '2026-01-01T00:00:00Z')

      expect(result).toBeNull()
    })

    it('should throw on unexpected DB error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: 'DB500', message: 'connection error' } })
      mockLimit.mockReturnValue({ single: mockSingle })
      mockOrder2.mockReturnValue({ limit: mockLimit })
      mockLte.mockReturnValue({ order: mockOrder2 })
      mockEq.mockReturnValue({ lte: mockLte })
      mockSelect.mockReturnValue({ eq: mockEq })

      await expect(svc.getEffectiveRate('apex-smart', '2026-01-01T00:00:00Z')).rejects.toThrow('getEffectiveRate failed')
    })
  })
})
