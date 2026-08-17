/**
 * Authenticated LiveAvatar HTTP client. The permanent API key is used ONLY here.
 */

import {
  LIVEAVATAR_API_BASE,
  type LiveAvatarMode,
} from './types';
import {
  normalizeLiveAvatarHttpError,
  sanitizeLiveAvatarErrorMessage,
  shouldRetryLiveAvatarError,
} from './errors';

export interface CreateSessionTokenRequest {
  mode: LiveAvatarMode;
  avatarId: string;
  isSandbox: boolean;
  /** Required for FULL mode — without it the avatar streams but stays silent. */
  contextId?: string;
  voiceId?: string;
  language?: string;
  /**
   * FULL mode only — LiveAvatar locks TTS speed at token creation
   * (`avatar_persona.voice_settings.speed`, typically 0.8–1.2).
   */
  voiceSpeed?: number;
  /**
   * FULL mode only — ElevenLabs-compatible affect knobs locked at token creation.
   */
  voiceStyle?: number;
  voiceStability?: number;
}

export interface CreateSessionTokenResult {
  sessionId: string;
  sessionToken: string;
}

export interface StartSessionResult {
  sessionId?: string;
  livekitUrl: string;
  livekitClientToken: string;
  wsUrl: string;
}

type FetchLike = typeof fetch;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function liveAvatarFetch(
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<Response> {
  return fetchImpl(`${LIVEAVATAR_API_BASE}${path}`, init);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export async function listContexts(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<Array<{ id: string; name: string }>> {
  const response = await liveAvatarFetch(
    '/v1/contexts?page_size=100',
    {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
      },
    },
    fetchImpl,
  );
  const text = await response.text();
  if (!response.ok) {
    throw normalizeLiveAvatarHttpError(response.status, text, 'token');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw normalizeLiveAvatarHttpError(500, 'invalid JSON from LiveAvatar contexts list', 'token');
  }
  const root = asRecord(parsed);
  const data = asRecord(root?.data) ?? root;
  const results = data?.results;
  if (!Array.isArray(results)) return [];
  const out: Array<{ id: string; name: string }> = [];
  for (const item of results) {
    const row = asRecord(item);
    const id = pickString(row, ['id']);
    const name = pickString(row, ['name']);
    if (id && name) out.push({ id, name });
  }
  return out;
}

export async function findContextIdByName(
  apiKey: string,
  name: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | undefined> {
  const contexts = await listContexts(apiKey, fetchImpl);
  return contexts.find((c) => c.name === name)?.id;
}

export async function createContext(
  apiKey: string,
  input: { name: string; prompt: string; openingText: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const response = await liveAvatarFetch(
    '/v1/contexts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        name: input.name,
        prompt: input.prompt,
        opening_text: input.openingText,
      }),
    },
    fetchImpl,
  );
  const text = await response.text();
  if (!response.ok) {
    // Reuse an existing context when the name is already taken.
    if (/already exists/i.test(text)) {
      const existing = await findContextIdByName(apiKey, input.name, fetchImpl);
      if (existing) {
        await updateContext(apiKey, existing, input, fetchImpl);
        return existing;
      }
    }
    throw normalizeLiveAvatarHttpError(response.status, text, 'token');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw normalizeLiveAvatarHttpError(500, 'invalid JSON from LiveAvatar contexts endpoint', 'token');
  }
  const root = asRecord(parsed);
  const data = asRecord(root?.data) ?? root;
  const id = pickString(data, ['id', 'context_id', 'contextId']);
  if (!id) {
    throw normalizeLiveAvatarHttpError(500, 'context response missing id', 'token');
  }
  return id;
}

/** Patch an existing context (used to clear stale opening greetings). */
export async function updateContext(
  apiKey: string,
  contextId: string,
  input: { name: string; prompt: string; openingText: string },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await liveAvatarFetch(
    `/v1/contexts/${encodeURIComponent(contextId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        name: input.name,
        prompt: input.prompt,
        opening_text: input.openingText,
      }),
    },
    fetchImpl,
  );
  if (!response.ok) {
    const text = await response.text();
    throw normalizeLiveAvatarHttpError(response.status, text, 'token');
  }
}

export async function createSessionToken(
  apiKey: string,
  request: CreateSessionTokenRequest,
  fetchImpl: FetchLike = fetch,
): Promise<CreateSessionTokenResult> {
  let attempt = 0;
  // Bounded retry for transient failures only.
  for (;;) {
    try {
      const body: Record<string, unknown> = {
        mode: request.mode,
        avatar_id: request.avatarId,
        is_sandbox: request.isSandbox,
      };
      if (request.mode === 'FULL') {
        const persona: Record<string, unknown> = {
          language: request.language ?? 'en',
        };
        if (request.contextId) persona.context_id = request.contextId;
        if (request.voiceId) persona.voice_id = request.voiceId;
        const voiceSettings: Record<string, unknown> = {};
        if (typeof request.voiceSpeed === 'number') {
          voiceSettings.speed = request.voiceSpeed;
        }
        if (typeof request.voiceStyle === 'number') {
          voiceSettings.style = request.voiceStyle;
        }
        if (typeof request.voiceStability === 'number') {
          voiceSettings.stability = request.voiceStability;
        }
        if (Object.keys(voiceSettings).length > 0) {
          persona.voice_settings = voiceSettings;
        }
        body.avatar_persona = persona;
      }

      const response = await liveAvatarFetch(
        '/v1/sessions/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
          },
          body: JSON.stringify(body),
        },
        fetchImpl,
      );
      const text = await response.text();
      if (!response.ok) {
        throw normalizeLiveAvatarHttpError(response.status, text, 'token');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw normalizeLiveAvatarHttpError(500, 'invalid JSON from LiveAvatar token endpoint', 'token');
      }
      const root = asRecord(parsed);
      const data = asRecord(root?.data) ?? root;
      const sessionId = pickString(data, ['session_id', 'sessionId']);
      const sessionToken = pickString(data, ['session_token', 'sessionToken']);
      if (!sessionId || !sessionToken) {
        throw normalizeLiveAvatarHttpError(500, 'session token response missing fields', 'token');
      }
      return { sessionId, sessionToken };
    } catch (error) {
      if (!shouldRetryLiveAvatarError(error, attempt)) throw error;
      attempt += 1;
      await sleep(200 * attempt);
    }
  }
}

export async function startSession(
  sessionToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<StartSessionResult> {
  let attempt = 0;
  for (;;) {
    try {
      const response = await liveAvatarFetch(
        '/v1/sessions/start',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
        },
        fetchImpl,
      );
      const text = await response.text();
      if (!response.ok) {
        throw normalizeLiveAvatarHttpError(response.status, text, 'start');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw normalizeLiveAvatarHttpError(500, 'invalid JSON from LiveAvatar start endpoint', 'start');
      }
      const root = asRecord(parsed);
      const data = asRecord(root?.data) ?? root;
      const livekitUrl = pickString(data, ['livekit_url', 'livekitUrl']);
      const livekitClientToken = pickString(data, ['livekit_client_token', 'livekitClientToken']);
      const wsUrl = pickString(data, ['ws_url', 'wsUrl']);
      if (!livekitUrl || !livekitClientToken || !wsUrl) {
        throw normalizeLiveAvatarHttpError(500, 'session start response missing connection fields', 'start');
      }
      return {
        sessionId: pickString(data, ['session_id', 'sessionId']),
        livekitUrl,
        livekitClientToken,
        wsUrl,
      };
    } catch (error) {
      if (!shouldRetryLiveAvatarError(error, attempt)) throw error;
      attempt += 1;
      await sleep(200 * attempt);
    }
  }
}

export async function stopSession(
  sessionToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await liveAvatarFetch(
    '/v1/sessions',
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    },
    fetchImpl,
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw normalizeLiveAvatarHttpError(response.status, text, 'stop');
  }
}

export async function keepSessionAlive(
  sessionToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await liveAvatarFetch(
    '/v1/sessions/keep-alive',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    },
    fetchImpl,
  );
  if (!response.ok) {
    const text = await response.text();
    throw normalizeLiveAvatarHttpError(response.status, text, 'keep_alive');
  }
}

export function maskSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return '••••';
  return `${sessionId.slice(0, 4)}…${sessionId.slice(-4)}`;
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeLiveAvatarErrorMessage(error.message);
  }
  return 'LiveAvatar request failed';
}
