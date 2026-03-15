/**
 * Shared helper to check whether a given email is in the ADMIN_EMAILS whitelist.
 * Single source of truth — used by adminAuth middleware and /auth/me endpoint.
 */

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)

/**
 * Returns true if the given email is in the ADMIN_EMAILS environment variable.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email)
}
