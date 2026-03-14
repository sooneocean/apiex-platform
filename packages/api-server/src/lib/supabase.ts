import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

let _supabaseClient: SupabaseClient | undefined
let _supabaseAdmin: SupabaseClient | undefined

/**
 * Supabase client using anon key.
 * RLS is enforced — used for user-scoped operations.
 * Lazily initialized to avoid crashing when env vars are missing (e.g. in tests).
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
    _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, clientOptions)
  }
  return _supabaseClient
}

/**
 * Supabase admin client using service_role key.
 * Bypasses RLS — used by api-server for privileged DB operations.
 * Lazily initialized to avoid crashing when env vars are missing (e.g. in tests).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
    _supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions)
  }
  return _supabaseAdmin
}

// Re-export as named constants for backward compatibility.
// These use Object.defineProperty for lazy evaluation.
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as Record<string | symbol, unknown>)[prop]
  },
})

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as Record<string | symbol, unknown>)[prop]
  },
})
