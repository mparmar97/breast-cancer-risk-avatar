/**
 * Normalized LiveAvatar errors. Never include API keys, Authorization
 * headers, or full session tokens in user-facing messages.
 */

export type LiveAvatarErrorCode =
  | 'configuration'
  | 'authentication'
  | 'session_start'
  | 'connection'
  | 'delivery'
  | 'audio'
  | 'session_ended'
  | 'transient'
  | 'unknown';

export class LiveAvatarError extends Error {
  readonly code: LiveAvatarErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(
    code: LiveAvatarErrorCode,
    message: string,
    options?: { retryable?: boolean; httpStatus?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LiveAvatarError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.httpStatus = options?.httpStatus;
  }
}

export class LiveAvatarConfigurationError extends LiveAvatarError {
  constructor(message: string) {
    super('configuration', message, { retryable: false });
    this.name = 'LiveAvatarConfigurationError';
  }
}

export class LiveAvatarAuthenticationError extends LiveAvatarError {
  constructor(message = 'LiveAvatar authentication failed') {
    super('authentication', message, { retryable: false, httpStatus: 401 });
    this.name = 'LiveAvatarAuthenticationError';
  }
}

export class LiveAvatarSessionStartError extends LiveAvatarError {
  constructor(message: string, options?: { retryable?: boolean; httpStatus?: number }) {
    super('session_start', message, { retryable: options?.retryable ?? false, httpStatus: options?.httpStatus });
    this.name = 'LiveAvatarSessionStartError';
  }
}

export class LiveAvatarConnectionError extends LiveAvatarError {
  constructor(message: string, options?: { retryable?: boolean }) {
    super('connection', message, { retryable: options?.retryable ?? true });
    this.name = 'LiveAvatarConnectionError';
  }
}

export class LiveAvatarDeliveryError extends LiveAvatarError {
  constructor(message: string, options?: { retryable?: boolean }) {
    super('delivery', message, { retryable: options?.retryable ?? false });
    this.name = 'LiveAvatarDeliveryError';
  }
}

export class LiveAvatarAudioError extends LiveAvatarError {
  constructor(message: string) {
    super('audio', message, { retryable: false });
    this.name = 'LiveAvatarAudioError';
  }
}

export class LiveAvatarSessionEndedError extends LiveAvatarError {
  constructor(message = 'LiveAvatar session ended') {
    super('session_ended', message, { retryable: false });
    this.name = 'LiveAvatarSessionEndedError';
  }
}

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /X-API-KEY["\s:=]+[^\s"']+/gi,
  /LIVEAVATAR_API_KEY["\s:=]+[^\s"']+/gi,
];

/** Strip anything that looks like a credential from an error string. */
export function sanitizeLiveAvatarErrorMessage(raw: string): string {
  let out = raw;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  // Truncate long JWT-looking blobs.
  out = out.replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]{20,}/g, '[redacted-token]');
  return out.slice(0, 280);
}

export function normalizeLiveAvatarHttpError(
  status: number,
  bodyText: string,
  stage: 'token' | 'start' | 'stop' | 'keep_alive',
): LiveAvatarError {
  const safe = sanitizeLiveAvatarErrorMessage(bodyText || `HTTP ${status}`);
  if (status === 401 || status === 403) {
    return new LiveAvatarAuthenticationError('LiveAvatar authentication failed');
  }
  if (status >= 500 || status === 429) {
    return new LiveAvatarSessionStartError(`LiveAvatar ${stage} temporarily unavailable`, {
      retryable: true,
      httpStatus: status,
    });
  }
  if (stage === 'start' || stage === 'token') {
    return new LiveAvatarSessionStartError(`LiveAvatar ${stage} failed: ${safe}`, {
      retryable: false,
      httpStatus: status,
    });
  }
  return new LiveAvatarError('unknown', `LiveAvatar ${stage} failed: ${safe}`, {
    retryable: false,
    httpStatus: status,
  });
}

/** Bounded retry: only for documented transient failures. */
export function shouldRetryLiveAvatarError(error: unknown, attempt: number, maxAttempts = 2): boolean {
  if (attempt >= maxAttempts) return false;
  if (error instanceof LiveAvatarError) {
    if (error.code === 'authentication' || error.code === 'configuration') return false;
    return error.retryable;
  }
  return false;
}
