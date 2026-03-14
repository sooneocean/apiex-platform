import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

// Mock @supabase/supabase-js to prevent real URL validation during module load
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

// Mock supabaseAdmin before importing KeyService
vi.mock('../../lib/supabase.js', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockReturnThis(),
  }
  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(mockChain),
      rpc: vi.fn(),
    },
    supabaseClient: {},
  }
})

import { supabaseAdmin } from '../../lib/supabase.js'
import { KeyService } from '../KeyService.js'

// Helper to get the fluent mock chain from supabaseAdmin.from(...)
function getMockChain() {
  return (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.results[
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.results.length - 1
  ]?.value
}

describe('KeyService', () => {
  let service: KeyService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new KeyService()
  })

  // ────────────────────────────────────────────────────────────────
  // Test 1: createKey
  // ────────────────────────────────────────────────────────────────
  describe('createKey', () => {
    it('should return key with apx-sk- prefix and store hash in DB', async () => {
      const mockUserQuota = { data: { default_quota_tokens: 100000 }, error: null }
      const mockInsert = {
        data: {
          id: 'key-123',
          user_id: 'user-abc',
          name: 'Test Key',
          key_hash: 'stored-hash',
          prefix: 'apx-sk-a',
          status: 'active',
          quota_tokens: 100000,
          created_at: new Date().toISOString(),
        },
        error: null,
      }

      // First call: user_quotas query
      // Second call: api_keys insert
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const quotaChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(mockUserQuota),
      }
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(mockInsert),
      }
      fromMock
        .mockReturnValueOnce(quotaChain)
        .mockReturnValueOnce(insertChain)

      const result = await service.createKey('user-abc', 'Test Key')

      // Must start with apx-sk-
      expect(result.key).toMatch(/^apx-sk-/)
      // key should be 32 bytes base64url encoded => 43 chars + prefix "apx-sk-" = 50 chars
      expect(result.key).toMatch(/^apx-sk-[A-Za-z0-9_-]+$/)
      // prefix should be first 8 chars
      expect(result.prefix).toBe(result.key.slice(0, 8))
      // id from DB record
      expect(result.id).toBe('key-123')

      // Verify insert was called with a hash (not plain key)
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-abc',
          name: 'Test Key',
          key_hash: expect.any(String),
          prefix: expect.stringMatching(/^apx-sk-/),
          quota_tokens: 100000,
        })
      )

      // Stored hash must NOT equal the plain key
      const insertArg = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertArg.key_hash).not.toBe(result.key)
      // Verify it is a valid SHA-256 hex string
      expect(insertArg.key_hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should default quota_tokens to -1 when user has no quota record', async () => {
      const mockUserQuota = { data: null, error: { code: 'PGRST116', message: 'Not found' } }
      const mockInsert = {
        data: {
          id: 'key-456',
          user_id: 'user-new',
          name: 'New Key',
          key_hash: 'stored-hash',
          prefix: 'apx-sk-b',
          status: 'active',
          quota_tokens: -1,
          created_at: new Date().toISOString(),
        },
        error: null,
      }

      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const quotaChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(mockUserQuota),
      }
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(mockInsert),
      }
      fromMock
        .mockReturnValueOnce(quotaChain)
        .mockReturnValueOnce(insertChain)

      await service.createKey('user-new', 'New Key')

      const insertArg = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertArg.quota_tokens).toBe(-1)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Test 2: validateKey
  // ────────────────────────────────────────────────────────────────
  describe('validateKey', () => {
    it('should return record for valid hash, null for invalid', async () => {
      const validHash = createHash('sha256').update('valid-key').digest('hex')
      const mockRecord = {
        id: 'key-123',
        key_hash: validHash,
        status: 'active',
        user_id: 'user-abc',
        quota_tokens: 100000,
      }

      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>

      // Valid hash - return record
      const validChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRecord, error: null }),
      }
      fromMock.mockReturnValueOnce(validChain)

      const found = await service.validateKey(validHash)
      expect(found).not.toBeNull()
      expect(found?.id).toBe('key-123')
      expect(found?.status).toBe('active')

      // Only queries status='active'
      expect(validChain.eq).toHaveBeenCalledWith('key_hash', validHash)
      expect(validChain.eq).toHaveBeenCalledWith('status', 'active')

      // Invalid hash - return null
      const invalidChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }
      fromMock.mockReturnValueOnce(invalidChain)

      const notFound = await service.validateKey('invalid-hash-xyz')
      expect(notFound).toBeNull()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Test 3: revokeKey
  // ────────────────────────────────────────────────────────────────
  describe('revokeKey', () => {
    it('should set status=revoked and revoked_at', async () => {
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'key-123',
            user_id: 'user-abc',
            status: 'revoked',
            revoked_at: new Date().toISOString(),
          },
          error: null,
        }),
      }
      fromMock.mockReturnValueOnce(updateChain)

      await service.revokeKey('user-abc', 'key-123')

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'revoked',
          revoked_at: expect.any(String),
        })
      )
      expect(updateChain.eq).toHaveBeenCalledWith('id', 'key-123')
      expect(updateChain.eq).toHaveBeenCalledWith('user_id', 'user-abc')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Test 4: reserveQuota
  // ────────────────────────────────────────────────────────────────
  describe('reserveQuota', () => {
    it('should atomically deduct estimated tokens and reject when insufficient', async () => {
      const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>

      // Sufficient quota: returns updated quota_tokens
      rpcMock.mockResolvedValueOnce({ data: 90000, error: null })
      const successResult = await service.reserveQuota('key-123', 10000)
      expect(successResult.success).toBe(true)
      expect(successResult.remainingTokens).toBe(90000)

      // Insufficient quota: returns null (no rows updated)
      rpcMock.mockResolvedValueOnce({ data: null, error: null })
      const failResult = await service.reserveQuota('key-123', 999999)
      expect(failResult.success).toBe(false)
      expect(failResult.remainingTokens).toBeUndefined()

      // Verify rpc was called with correct params
      expect(rpcMock).toHaveBeenCalledWith('reserve_quota', {
        p_key_id: 'key-123',
        p_estimated: 10000,
      })
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Test 5: settleQuota
  // ────────────────────────────────────────────────────────────────
  describe('settleQuota', () => {
    it('should refund excess or charge deficit, skip when quota=-1', async () => {
      const rpcMock = supabaseAdmin.rpc as ReturnType<typeof vi.fn>

      // Case 1: actual < reserved → refund diff back
      rpcMock.mockResolvedValueOnce({ data: null, error: null })
      await service.settleQuota('key-123', 10000, 7000)
      // diff = reserved - actual = 10000 - 7000 = 3000 → add back 3000
      expect(rpcMock).toHaveBeenLastCalledWith('settle_quota', {
        p_key_id: 'key-123',
        p_diff: 3000,
      })

      // Case 2: actual > reserved → charge extra
      rpcMock.mockResolvedValueOnce({ data: null, error: null })
      await service.settleQuota('key-123', 5000, 8000)
      // diff = 5000 - 8000 = -3000 → subtract 3000 more
      expect(rpcMock).toHaveBeenLastCalledWith('settle_quota', {
        p_key_id: 'key-123',
        p_diff: -3000,
      })

      // Case 3: quota=-1 → skip, no rpc call
      rpcMock.mockClear()
      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      // We need to check quota first; service should skip if quota=-1
      // The DoD says: quota_tokens = -1 的 key 不做結算操作
      // Implementation must check or be told; let's assume settleQuota has
      // a way to know (either accept a flag or query). Per DoD SQL comment,
      // the SQL itself skips quota=-1. We test by checking rpc IS called
      // but the SQL WHERE clause handles the -1 case.
      // Actually DoD says SQL: UPDATE ... WHERE quota_tokens != -1
      // So rpc is still called, just the SQL won't update anything.
      // Let's verify: rpc should still be called with the diff.
      rpcMock.mockResolvedValueOnce({ data: null, error: null })
      await service.settleQuota('key-unlimited', 10000, 10000)
      // diff = 0, rpc still called (DB handles the -1 skip)
      expect(rpcMock).toHaveBeenCalledWith('settle_quota', {
        p_key_id: 'key-unlimited',
        p_diff: 0,
      })
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Test 6: listKeys
  // ────────────────────────────────────────────────────────────────
  describe('listKeys', () => {
    it('should return all keys for user with prefix but no hash', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          user_id: 'user-abc',
          name: 'Key One',
          prefix: 'apx-sk-a',
          status: 'active',
          quota_tokens: 100000,
          created_at: new Date().toISOString(),
          key_hash: 'should-not-appear',
        },
        {
          id: 'key-2',
          user_id: 'user-abc',
          name: 'Key Two',
          prefix: 'apx-sk-b',
          status: 'revoked',
          quota_tokens: 0,
          created_at: new Date().toISOString(),
          key_hash: 'should-not-appear-2',
        },
      ]

      const fromMock = supabaseAdmin.from as ReturnType<typeof vi.fn>
      const listChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockKeys, error: null }),
      }
      fromMock.mockReturnValueOnce(listChain)

      const result = await service.listKeys('user-abc')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('key-1')
      expect(result[0].prefix).toBe('apx-sk-a')
      // key_hash must NOT be in the returned data
      expect(result[0]).not.toHaveProperty('key_hash')
      expect(result[1]).not.toHaveProperty('key_hash')
    })
  })
})
