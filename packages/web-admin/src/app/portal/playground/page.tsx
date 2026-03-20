'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Send, Square, Trash2, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { makeKeysApi, type ApiKey } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export default function PlaygroundPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Get auth token
  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      router.push('/admin/login')
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }

  // Fetch API keys
  const keysQuery = useQuery({
    queryKey: ['portal', 'keys'],
    queryFn: async () => {
      const token = await getToken()
      const api = makeKeysApi(token)
      const res = await api.list()
      return res.data
    },
  })

  // Fetch models using selected API key
  const modelsQuery = useQuery({
    queryKey: ['portal', 'models', selectedKeyId],
    queryFn: async () => {
      if (!selectedKeyId) return []
      const token = await getToken()
      const res = await fetch(`${API_BASE}/v1/models`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.data ?? []) as Array<{ id: string; owned_by: string }>
    },
    enabled: !!selectedKeyId,
  })

  // Auto-select first key and model
  useEffect(() => {
    if (!selectedKeyId && keysQuery.data?.length) {
      setSelectedKeyId(keysQuery.data[0].id)
    }
  }, [keysQuery.data, selectedKeyId])

  useEffect(() => {
    if (!selectedModel && modelsQuery.data?.length) {
      setSelectedModel(modelsQuery.data[0].id)
    }
  }, [modelsQuery.data, selectedModel])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || streaming || !selectedModel) return

    setError(null)
    setLastUsage(null)
    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    // Add empty assistant message for streaming
    setMessages([...newMessages, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`
        setError(errMsg)
        // Remove empty assistant message
        setMessages(newMessages)
        setStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setError('No response stream')
        setMessages(newMessages)
        setStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let assistantContent = ''
      let usage: TokenUsage | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assistantContent += delta
              setMessages([...newMessages, { role: 'assistant', content: assistantContent }])
            }
            if (chunk.usage) {
              usage = chunk.usage
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      if (usage) {
        setLastUsage(usage)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — keep partial response
      } else {
        setError((err as Error).message)
        setMessages(newMessages)
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }, [input, streaming, selectedModel, messages, router])

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleClear() {
    setMessages([])
    setLastUsage(null)
    setError(null)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const keys = keysQuery.data ?? []
  const models = modelsQuery.data ?? []

  return (
    <div className="flex flex-col h-[calc(100vh-56px-48px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-1 pb-3 border-b border-gray-200">
        <select
          value={selectedKeyId ?? ''}
          onChange={(e) => {
            setSelectedKeyId(e.target.value || null)
            setSelectedModel('')
          }}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Select API Key</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.key_prefix})
            </option>
          ))}
        </select>

        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={!selectedKeyId || models.length === 0}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white disabled:opacity-40"
        >
          <option value="">Select Model</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {lastUsage && (
          <span className="text-xs text-gray-400">
            {lastUsage.prompt_tokens} in / {lastUsage.completion_tokens} out / {lastUsage.total_tokens} total
          </span>
        )}

        <button
          onClick={handleClear}
          disabled={messages.length === 0 && !error}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="Clear chat"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && !error && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {selectedKeyId ? 'Send a message to start' : 'Select an API Key to begin'}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm" />
              ) : null)}
            </div>
          </div>
        ))}

        {error && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedKeyId ? 'Type a message... (Enter to send, Shift+Enter for newline)' : 'Select an API Key first'}
            disabled={!selectedKeyId || streaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-40 disabled:bg-gray-50"
            style={{ maxHeight: '120px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`
            }}
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="shrink-0 rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 transition-colors"
              title="Stop"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !selectedModel || !selectedKeyId}
              className="shrink-0 rounded-lg bg-gray-900 p-2 text-white hover:bg-gray-800 disabled:opacity-30 transition-colors"
              title="Send"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
