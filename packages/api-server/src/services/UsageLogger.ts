import { supabaseAdmin } from '../lib/supabase.js'

export interface UsageLogEntry {
  apiKeyId: string
  modelTag: string
  upstreamModel: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  latencyMs: number
  status: 'success' | 'incomplete' | 'error'
}

export class UsageLogger {
  /**
   * Log a usage entry to the database.
   * Fire-and-forget: never throws on DB errors.
   */
  async logUsage(entry: UsageLogEntry): Promise<void> {
    try {
      await supabaseAdmin
        .from('usage_logs')
        .insert({
          api_key_id: entry.apiKeyId,
          model_tag: entry.modelTag,
          upstream_model: entry.upstreamModel,
          prompt_tokens: entry.promptTokens,
          completion_tokens: entry.completionTokens,
          total_tokens: entry.totalTokens,
          latency_ms: entry.latencyMs,
          status: entry.status,
        })
        .select()
        .single()
    } catch (err) {
      console.error('UsageLogger: failed to write usage log', err)
    }
  }
}
