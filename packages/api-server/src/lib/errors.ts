/**
 * OpenAI-compatible error format utilities
 */

export interface OpenAIError {
  error: {
    message: string
    type: string
    code: string
  }
}

export function makeError(message: string, type: string, code: string, status: number): Response {
  const body: OpenAIError = { error: { message, type, code } }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Errors = {
  invalidApiKey: () =>
    makeError('Invalid API key. Please provide a valid Apiex API key.', 'authentication_error', 'invalid_api_key', 401),

  invalidToken: () =>
    makeError('Invalid or expired token.', 'authentication_error', 'invalid_token', 401),

  adminRequired: () =>
    makeError('Admin access required.', 'authorization_error', 'admin_required', 403),

  quotaExhausted: () =>
    makeError('Quota exhausted. Please contact your admin to increase your quota.', 'insufficient_quota', 'quota_exhausted', 402),

  unsupportedModel: (model: string) =>
    makeError(
      `Model '${model}' is not supported. Valid values: apex-smart, apex-cheap.`,
      'invalid_request_error',
      'unsupported_model',
      400
    ),

  routeNotConfigured: () =>
    makeError('Route not configured. Please contact admin.', 'server_error', 'route_not_configured', 503),

  upstreamTimeout: () =>
    makeError('Upstream service timed out.', 'server_error', 'upstream_timeout', 502),

  upstreamError: (detail?: string) =>
    makeError(detail ?? 'Upstream service returned an unexpected response.', 'server_error', 'upstream_error', 502),

  internalError: () =>
    makeError('An internal server error occurred.', 'server_error', 'internal_error', 500),

  notFound: () =>
    makeError('The requested resource was not found.', 'invalid_request_error', 'not_found', 404),

  rateLimitExceeded: () =>
    makeError('Rate limit exceeded. Please wait before retrying.', 'rate_limit_error', 'rate_limit', 429),
}
