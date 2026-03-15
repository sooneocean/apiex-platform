import { supabaseAdmin } from '../lib/supabase.js'
import type { ModelRate, ModelRateInsert, ModelRateUpdate } from '../lib/database.types.js'

export class RatesService {
  /**
   * List all model rates, ordered by model_tag ASC, effective_from DESC.
   */
  async listRates(): Promise<ModelRate[]> {
    const { data, error } = await supabaseAdmin
      .from('model_rates')
      .select('*')
      .order('model_tag', { ascending: true })
      .order('effective_from', { ascending: false })

    if (error) {
      throw new Error(`listRates failed: ${error.message}`)
    }

    return data ?? []
  }

  /**
   * Insert a new model rate record.
   * effective_from defaults to now() if not provided.
   */
  async createRate(data: ModelRateInsert): Promise<ModelRate> {
    const { data: row, error } = await supabaseAdmin
      .from('model_rates')
      .insert({
        model_tag: data.model_tag,
        input_rate_per_1k: data.input_rate_per_1k,
        output_rate_per_1k: data.output_rate_per_1k,
        ...(data.effective_from ? { effective_from: data.effective_from } : {}),
      })
      .select()
      .single()

    if (error) {
      throw new Error(`createRate failed: ${error.message}`)
    }

    return row
  }

  /**
   * Update an existing rate record by ID.
   */
  async updateRate(id: string, data: ModelRateUpdate): Promise<ModelRate> {
    const { data: row, error } = await supabaseAdmin
      .from('model_rates')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`updateRate failed: ${error.message}`)
    }

    if (!row) {
      throw new Error(`not_found`)
    }

    return row
  }

  /**
   * Get the effective rate for a given model at a specific point in time.
   * Returns the most recent rate where effective_from <= asOfDate.
   * Returns null if no rate exists.
   */
  async getEffectiveRate(modelTag: string, asOfDate: string | Date): Promise<ModelRate | null> {
    const dateStr = typeof asOfDate === 'string' ? asOfDate : asOfDate.toISOString()

    const { data, error } = await supabaseAdmin
      .from('model_rates')
      .select('*')
      .eq('model_tag', modelTag)
      .lte('effective_from', dateStr)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // PGRST116 = no rows returned — not an error for this use case
      if (error.code === 'PGRST116') return null
      throw new Error(`getEffectiveRate failed: ${error.message}`)
    }

    return data ?? null
  }
}
