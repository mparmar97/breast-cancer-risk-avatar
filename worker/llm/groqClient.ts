import type { Env } from '../types';

/**
 * Minimal Groq (OpenAI-compatible) Chat Completions client, built on the
 * Cloudflare Worker `fetch` global directly — no Node-only APIs, no SDK
 * dependency. See docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md for how this fits
 * into the wider chat pipeline.
 *
 * `env.GROQ_API_KEY` is never logged, never included in a thrown error's
 * message, and never returned to the caller. Callers that need to surface
 * a failure to the browser must always use `GroqRequestError.code` (a
 * closed enum) — never `error.message` or the raw provider response body.
 */

export const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_GROQ_TIMEOUT_MS = 18_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVitestRuntime(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return Boolean(proc?.env?.VITEST);
}

/** Backoff before a single automatic retry. Zero in Vitest so unit tests stay fast. */
function retryBackoffMs(error: GroqRequestError, retryAfterHeader: string | null): number {
  if (isVitestRuntime()) return 0;
  if (error.code === 'rate_limited') {
    const fromHeader = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
    if (Number.isFinite(fromHeader) && fromHeader >= 0) {
      return Math.min(8_000, Math.max(500, fromHeader * 1000));
    }
    return 2_000;
  }
  return 300;
}

export type GroqMessageRole = 'system' | 'user' | 'assistant';

export interface GroqMessage {
  role: GroqMessageRole;
  content: string;
}

export interface GroqJsonSchema {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
}

export type GroqResponseFormat = { type: 'json_schema'; json_schema: GroqJsonSchema };

export type GroqReasoningEffort = 'low' | 'medium' | 'high';

export interface GroqChatCompletionRequest {
  messages: GroqMessage[];
  responseFormat?: GroqResponseFormat;
  temperature?: number;
  maxCompletionTokens?: number;
  timeoutMs?: number;
  /**
   * GPT-OSS models spend part of `maxCompletionTokens` on hidden reasoning
   * before emitting the visible/structured output (default: `"medium"` on
   * Groq). For short, latency-sensitive structured-output calls, `"low"`
   * leaves more of the token budget for the actual JSON response.
   */
  reasoningEffort?: GroqReasoningEffort;
}

export interface GroqCompletionResult {
  content: string;
  model: string;
}

export type GroqErrorCode =
  | 'missing_configuration'
  | 'timeout'
  | 'network_error'
  | 'rate_limited'
  | 'authentication_error'
  | 'provider_error'
  | 'invalid_response'
  | 'schema_validation_error';

export class GroqRequestError extends Error {
  code: GroqErrorCode;
  status?: number;
  retryable: boolean;

  constructor(code: GroqErrorCode, message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'GroqRequestError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Maps GroqRequestError / HTTP status to a closed sanitized category.
 * Never returns raw provider messages.
 */
export type SanitizedProviderErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'provider_error'
  | 'invalid_response'
  | 'missing_configuration'
  | 'schema_validation'
  | 'unknown';

export function categorizeProviderError(error: unknown): SanitizedProviderErrorCategory {
  if (error instanceof GroqRequestError) {
    switch (error.code) {
      case 'authentication_error':
        return 'authentication';
      case 'rate_limited':
        return 'rate_limit';
      case 'timeout':
        return 'timeout';
      case 'network_error':
        return 'network';
      case 'missing_configuration':
        return 'missing_configuration';
      case 'invalid_response':
        return 'invalid_response';
      case 'schema_validation_error':
        return 'schema_validation';
      case 'provider_error':
        if (error.status === 401 || error.status === 403) return 'authentication';
        if (error.status === 429) return 'rate_limit';
        return 'provider_error';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

/** One automatic retry only for timeout / network / rate_limit. */
export function isSingleRetryCategory(error: unknown): boolean {
  if (!(error instanceof GroqRequestError)) return false;
  return (
    error.code === 'timeout' ||
    error.code === 'network_error' ||
    error.code === 'rate_limited'
  );
}

/** Test-only injection point — never used to reach the real Groq API from automated tests. */
export type FetchLike = typeof fetch;

function resolveModel(env: Env): string {
  return env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

interface RawGroqChoice {
  message?: { content?: unknown };
}

interface RawGroqResponse {
  choices?: RawGroqChoice[];
  model?: unknown;
  error?: { message?: unknown; code?: unknown };
}

async function performGroqRequest(
  env: Env,
  input: GroqChatCompletionRequest,
  fetchImpl: FetchLike,
): Promise<GroqCompletionResult> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqRequestError('missing_configuration', 'Groq is not configured for this environment.');
  }

  const model = resolveModel(env);
  const timeoutMs = Math.min(25_000, Math.max(12_000, input.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> = {
    model,
    messages: input.messages,
    n: 1,
    stream: false,
  };
  if (typeof input.temperature === 'number') {
    payload.temperature = input.temperature;
  }
  if (typeof input.maxCompletionTokens === 'number') {
    payload.max_completion_tokens = input.maxCompletionTokens;
  }
  if (input.responseFormat) {
    payload.response_format = input.responseFormat;
  }
  if (input.reasoningEffort) {
    payload.reasoning_effort = input.reasoningEffort;
  }

  let response: Response;
  try {
    response = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GroqRequestError('timeout', 'The Groq request timed out.', { retryable: true });
    }
    throw new GroqRequestError('network_error', 'A network error occurred while contacting Groq.', {
      retryable: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GroqRequestError('authentication_error', 'Groq authentication failed.', {
        status: response.status,
        retryable: false,
      });
    }
    if (response.status === 429) {
      const err = new GroqRequestError('rate_limited', 'Groq rate limit exceeded.', {
        status: response.status,
        retryable: true,
      });
      (err as GroqRequestError & { retryAfter?: string | null }).retryAfter =
        response.headers.get('retry-after');
      throw err;
    }
    if (response.status === 400) {
      throw new GroqRequestError('provider_error', 'Groq rejected the request.', {
        status: response.status,
        retryable: false,
      });
    }
    throw new GroqRequestError('provider_error', 'Groq returned an error response.', {
      status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }

  let parsed: RawGroqResponse;
  try {
    parsed = (await response.json()) as RawGroqResponse;
  } catch {
    throw new GroqRequestError('invalid_response', 'Groq returned a response that was not valid JSON.');
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new GroqRequestError('invalid_response', 'Groq response did not include message content.');
  }

  return {
    content,
    model: typeof parsed.model === 'string' ? parsed.model : model,
  };
}

/**
 * Sends a single Chat Completions request to Groq, with a bounded timeout
 * and at most one automatic retry — only for timeout, network, or
 * rate_limit failures (with short backoff on 429). Never throws a
 * raw provider error message — always a {@link GroqRequestError} with a closed `code`.
 */
export async function createGroqChatCompletion(
  env: Env,
  input: GroqChatCompletionRequest,
  fetchImpl: FetchLike = fetch,
): Promise<GroqCompletionResult> {
  try {
    return await performGroqRequest(env, input, fetchImpl);
  } catch (error) {
    if (isSingleRetryCategory(error) && error instanceof GroqRequestError) {
      const retryAfter =
        (error as GroqRequestError & { retryAfter?: string | null }).retryAfter ?? null;
      await sleep(retryBackoffMs(error, retryAfter));
      return await performGroqRequest(env, input, fetchImpl);
    }
    throw error;
  }
}
