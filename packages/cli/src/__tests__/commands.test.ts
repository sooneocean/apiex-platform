/**
 * T14 TDD — CLI 指令測試
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config module
vi.mock('../lib/config.js', () => ({
  getApiKey: vi.fn().mockReturnValue('apx-sk-test-key'),
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
  writeConfig: vi.fn(),
  readConfig: vi.fn().mockReturnValue({}),
  clearConfig: vi.fn(),
  getConfigPath: vi.fn().mockReturnValue('/tmp/.apiex/config.json'),
}))

// Mock api module
vi.mock('../lib/api.js', () => ({
  apiRequest: vi.fn(),
}))

describe('CLI Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('should export loginAction function', async () => {
      const { loginAction } = await import('../commands/login.js')
      expect(typeof loginAction).toBe('function')
    })

    it('should export logoutAction function', async () => {
      const { logoutAction } = await import('../commands/login.js')
      expect(typeof logoutAction).toBe('function')
    })
  })

  describe('keys', () => {
    it('should export keysListAction', async () => {
      const { keysListAction } = await import('../commands/keys.js')
      expect(typeof keysListAction).toBe('function')
    })

    it('should export keysCreateAction', async () => {
      const { keysCreateAction } = await import('../commands/keys.js')
      expect(typeof keysCreateAction).toBe('function')
    })

    it('should export keysRevokeAction', async () => {
      const { keysRevokeAction } = await import('../commands/keys.js')
      expect(typeof keysRevokeAction).toBe('function')
    })
  })

  describe('chat', () => {
    it('should export chatAction', async () => {
      const { chatAction } = await import('../commands/chat.js')
      expect(typeof chatAction).toBe('function')
    })

    it('chatAction should call apiRequest with correct params', async () => {
      const { apiRequest } = await import('../lib/api.js')
      const mockApiRequest = apiRequest as ReturnType<typeof vi.fn>
      mockApiRequest.mockResolvedValue({
        ok: true,
        data: {
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      })

      const { chatAction } = await import('../commands/chat.js')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await chatAction('Hello', { model: 'apex-smart', json: true })

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/v1/chat/completions', {
        model: 'apex-smart',
        messages: [{ role: 'user', content: 'Hello' }],
      })

      consoleSpy.mockRestore()
    })
  })

  describe('status', () => {
    it('should export statusAction', async () => {
      const { statusAction } = await import('../commands/status.js')
      expect(typeof statusAction).toBe('function')
    })
  })
})
