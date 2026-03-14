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

// --- Custom Error Classes ---

export class ApiError extends Error {
  public readonly statusCode: number
  public readonly type: string
  public readonly code: string

  constructor(message: string, statusCode: number, type: string, code: string) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.type = type
    this.code = code
  }

  toResponse(): Response {
    return makeError(this.message, this.type, this.code, this.statusCode)
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Invalid API key.', code = 'invalid_api_key') {
    super(message, 401, 'authentication_error', code)
    this.name = 'AuthenticationError'
  }
}

export class InvalidRequestError extends ApiError {
  constructor(message: string, code = 'invalid_request') {
    super(message, 400, 'invalid_request_error', code)
    this.name = 'InvalidRequestError'
  }
}

export class InsufficientQuotaError extends ApiError {
  constructor(message = 'Quota exhausted.', code = 'quota_exhausted') {
    super(message, 402, 'insufficient_quota', code)
    this.name = 'InsufficientQuotaError'
  }
}

export class ServerError extends ApiError {
  constructor(message = 'An internal server error occurred.', code = 'internal_error') {
    super(message, 500, 'server_error', code)
    this.name = 'ServerError'
  }
}

// --- Response factory ---

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
