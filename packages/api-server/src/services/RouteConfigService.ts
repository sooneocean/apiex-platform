import { supabaseAdmin } from '../lib/supabase.js'

export interface RouteConfig {
  id: string
  tag: string
  upstream_provider: string
  upstream_model: string
  upstream_base_url: string
  is_active: boolean
  updated_at: string
}

export interface RouteConfigCreate {
  tag: string
  upstream_provider: string
  upstream_model: string
  upstream_base_url: string
  is_active?: boolean
}

export interface RouteConfigUpdate {
  tag?: string
  upstream_provider?: string
  upstream_model?: string
  upstream_base_url?: string
  is_active?: boolean
}

export class RouteConfigService {
  /**
   * List all route_config records, ordered by tag ASC, updated_at DESC.
   * Includes both active and inactive records.
   */
  async listAll(): Promise<RouteConfig[]> {
    const { data, error } = await supabaseAdmin
      .from('route_config')
      .select('*')
      .order('tag', { ascending: true })
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`listAll failed: ${error.message}`)
    }

    return data ?? []
  }

  /**
   * Insert a new route_config record.
   * Throws on unique constraint violation (duplicate active tag).
   */
  async create(data: RouteConfigCreate): Promise<RouteConfig> {
    const { data: row, error } = await supabaseAdmin
      .from('route_config')
      .insert({
        tag: data.tag,
        upstream_provider: data.upstream_provider,
        upstream_model: data.upstream_model,
        upstream_base_url: data.upstream_base_url,
        is_active: data.is_active ?? true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      // PostgreSQL unique constraint violation code
      if (error.code === '23505') {
        throw new Error('conflict')
      }
      throw new Error(`create failed: ${error.message}`)
    }

    return row
  }

  /**
   * Update an existing route_config record by ID.
   * Automatically sets updated_at = now().
   * Throws 'not_found' if record does not exist.
   * Throws 'conflict' on unique constraint violation.
   */
  async update(id: string, data: RouteConfigUpdate): Promise<RouteConfig> {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (data.tag !== undefined) updatePayload.tag = data.tag
    if (data.upstream_provider !== undefined) updatePayload.upstream_provider = data.upstream_provider
    if (data.upstream_model !== undefined) updatePayload.upstream_model = data.upstream_model
    if (data.upstream_base_url !== undefined) updatePayload.upstream_base_url = data.upstream_base_url
    if (data.is_active !== undefined) updatePayload.is_active = data.is_active

    const { data: row, error } = await supabaseAdmin
      .from('route_config')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // PGRST116 = no rows returned (record not found)
      if (error.code === 'PGRST116') {
        throw new Error('not_found')
      }
      // PostgreSQL unique constraint violation
      if (error.code === '23505') {
        throw new Error('conflict')
      }
      throw new Error(`update failed: ${error.message}`)
    }

    if (!row) {
      throw new Error('not_found')
    }

    return row
  }

  /**
   * Toggle the is_active flag for a route_config record.
   * Convenience wrapper around update().
   */
  async toggleActive(id: string, isActive: boolean): Promise<RouteConfig> {
    return this.update(id, { is_active: isActive })
  }
}
