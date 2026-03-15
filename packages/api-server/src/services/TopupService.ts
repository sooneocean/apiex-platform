import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripeClient } from '../lib/stripe.js'
import { supabaseAdmin } from '../lib/supabase.js'

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

interface Plan {
  amount: number   // cents (USD)
  tokens: number
}

const PLANS: Record<string, Plan> = {
  plan_5:  { amount: 500,  tokens: 500_000 },
  plan_10: { amount: 1000, tokens: 1_000_000 },
  plan_20: { amount: 2000, tokens: 2_000_000 },
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface CheckoutSessionResult {
  checkout_url: string
  session_id: string
}

export type TopupStatusResult =
  | { status: 'pending' }
  | { status: 'completed'; tokens_granted: number; completed_at: string }

export interface PaginatedLogs<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
  }
}

// ---------------------------------------------------------------------------
// TopupService
// ---------------------------------------------------------------------------

export class TopupService {
  private stripe: Stripe
  private db: SupabaseClient

  constructor(stripeClient?: Stripe, supabaseClient?: SupabaseClient) {
    this.stripe = stripeClient ?? getStripeClient()
    this.db = supabaseClient ?? supabaseAdmin
  }

  // ─── 1. createCheckoutSession ────────────────────────────────────────────

  async createCheckoutSession(
    userId: string,
    planId: string
  ): Promise<CheckoutSessionResult> {
    const plan = PLANS[planId]
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}. Valid values: plan_5, plan_10, plan_20.`)
    }

    const successUrl =
      process.env.TOPUP_SUCCESS_URL ?? `${process.env.APP_URL ?? 'http://localhost:3001'}/portal/topup/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl =
      process.env.TOPUP_CANCEL_URL ?? `${process.env.APP_URL ?? 'http://localhost:3001'}/portal/topup/cancel`

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Apiex Topup — ${plan.tokens.toLocaleString()} tokens`,
            },
            unit_amount: plan.amount,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        plan_id: planId,
        tokens_granted: String(plan.tokens),
      },
    })

    if (!session.url || !session.id) {
      throw new Error('Stripe returned an incomplete session object.')
    }

    return {
      checkout_url: session.url,
      session_id: session.id,
    }
  }

  // ─── 2. handleWebhookEvent ───────────────────────────────────────────────

  async handleWebhookEvent(rawBody: string, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

    // Signature verification — throws on failure
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)

    if (event.type !== 'checkout.session.completed') {
      // Ignore all other event types
      return
    }

    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata ?? {}
    const userId = meta.user_id
    const tokensGranted = parseInt(meta.tokens_granted ?? '0', 10)
    const amountUsd = session.amount_total ?? 0

    if (!userId || !tokensGranted) {
      throw new Error('Missing required metadata in checkout session.')
    }

    // 1. INSERT topup_logs (idempotent via stripe_event_id UNIQUE)
    const { error: insertError } = await this.db
      .from('topup_logs')
      .insert({
        user_id: userId,
        stripe_session_id: session.id,
        stripe_event_id: event.id,
        amount_usd: amountUsd,
        tokens_granted: tokensGranted,
      })
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        // Duplicate event — idempotent success, skip quota update
        return
      }
      throw new Error(`Failed to insert topup_log: ${insertError.message}`)
    }

    // 2. Accumulate quota
    await this.addQuota(userId, tokensGranted)
  }

  // ─── 3. getTopupStatus ───────────────────────────────────────────────────

  async getTopupStatus(sessionId: string): Promise<TopupStatusResult> {
    const { data, error } = await this.db
      .from('topup_logs')
      .select('tokens_granted, created_at, status')
      .eq('stripe_session_id', sessionId)
      .single()

    if (error || !data) {
      return { status: 'pending' }
    }

    return {
      status: 'completed',
      tokens_granted: data.tokens_granted as number,
      completed_at: data.created_at as string,
    }
  }

  // ─── 4. getUserLogs ──────────────────────────────────────────────────────

  async getUserLogs(
    userId: string,
    page: number,
    limit: number
  ): Promise<PaginatedLogs<Record<string, unknown>>> {
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await this.db
      .from('topup_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Failed to fetch user topup logs: ${error.message}`)
    }

    return {
      data: (data ?? []) as Record<string, unknown>[],
      pagination: { page, limit, total: count ?? 0 },
    }
  }

  // ─── 5. getAllLogs ───────────────────────────────────────────────────────

  async getAllLogs(filters: {
    page: number
    limit: number
    user_id?: string
  }): Promise<PaginatedLogs<Record<string, unknown>>> {
    const { page, limit, user_id } = filters
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = this.db
      .from('topup_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    const { data, error, count } = await query

    if (error) {
      throw new Error(`Failed to fetch all topup logs: ${error.message}`)
    }

    return {
      data: (data ?? []) as Record<string, unknown>[],
      pagination: { page, limit, total: count ?? 0 },
    }
  }

  // ─── private: addQuota ───────────────────────────────────────────────────

  private async addQuota(userId: string, tokens: number): Promise<void> {
    // Use atomic SQL function to INCREMENT quota (not set).
    // Handles both user_quotas UPSERT and api_keys UPDATE in one call.
    // Skips api_keys with quota_tokens = -1 (unlimited).
    const { error } = await this.db.rpc('add_topup_quota', {
      p_user_id: userId,
      p_tokens: tokens,
    })

    if (error) {
      throw new Error(`Failed to add topup quota: ${error.message}`)
    }
  }
}
