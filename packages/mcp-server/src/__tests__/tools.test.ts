import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('MCP Server tool registration', () => {
  it('should register three tools: apiex_chat, apiex_models, apiex_usage', async () => {
    // Mock the MCP SDK
    const toolFn = vi.fn()
    const connectFn = vi.fn()

    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: vi.fn().mockImplementation(() => ({
        tool: toolFn,
        connect: connectFn,
      })),
    }))

    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: vi.fn(),
    }))

    vi.doMock('../lib/config.js', () => ({
      getApiKey: () => 'test-key',
      getBaseUrl: () => 'http://localhost:3000',
    }))

    // Import after mocking
    await import('../index.js')

    // Verify 3 tools registered
    expect(toolFn).toHaveBeenCalledTimes(3)

    // Check tool names
    const toolNames = toolFn.mock.calls.map((call: unknown[]) => call[0])
    expect(toolNames).toContain('apiex_chat')
    expect(toolNames).toContain('apiex_models')
    expect(toolNames).toContain('apiex_usage')
  })
})
