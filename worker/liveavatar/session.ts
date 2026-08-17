import type { Env } from '../types';
import { assertLiveAvatarReadyForSession } from './config';
import {
  createContext,
  createSessionToken,
  findContextIdByName,
  keepSessionAlive,
  publicErrorMessage,
  startSession,
  stopSession,
  updateContext,
} from './client';
import { LiveAvatarError } from './errors';
import {
  LIVEAVATAR_DELIVERY_CONTEXT_OPENING,
  LIVEAVATAR_DELIVERY_CONTEXT_PROMPT,
} from './types';
import {
  clampLiveAvatarVoiceSpeed,
  LIVEAVATAR_VOICE_SPEED_DEFAULT,
} from '../embodiment/voiceSpeed';
import {
  avatarExpressionToVoiceAffect,
  clampVoiceStability,
  clampVoiceStyle,
  type LiveAvatarVoiceAffect,
} from '../embodiment/voiceAffect';
import type { AvatarExpression } from '../embodiment/types';

/**
 * Safe payload for the browser after server-side token creation.
 * The permanent API key never leaves the Worker.
 *
 * The @heygen/liveavatar-web-sdk calls POST /v1/sessions/start itself via
 * `LiveAvatarSession.start()`, so the Worker must NOT also call start
 * (that would double-start). Optional `startOnServer` is for tests/mocks.
 */
export interface LiveAvatarSessionStartPayload {
  sessionId: string;
  sessionToken: string;
  sandbox: boolean;
  avatarId: string;
  mode: 'FULL' | 'LITE';
  /** Applied FULL-mode TTS speed (locked for this session token). */
  voiceSpeed: number;
  /** Applied FULL-mode voice affect (locked for this session token). */
  voiceAffect: LiveAvatarVoiceAffect;
  developmentMaxSessionSeconds?: number;
  /** Only present when startOnServer was requested (tests). */
  livekitUrl?: string;
  livekitClientToken?: string;
  wsUrl?: string;
}

export interface StartLiveAvatarSessionResult {
  ok: true;
  session: LiveAvatarSessionStartPayload;
}

export interface StartLiveAvatarSessionFailure {
  ok: false;
  error: string;
  code: string;
}

const DELIVERY_CONTEXT_NAME = 'VARE delivery presenter';

async function resolveContextId(
  apiKey: string,
  configuredContextId: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string> {
  const deliveryContext = {
    name: DELIVERY_CONTEXT_NAME,
    prompt: LIVEAVATAR_DELIVERY_CONTEXT_PROMPT,
    openingText: LIVEAVATAR_DELIVERY_CONTEXT_OPENING,
  };

  if (configuredContextId) {
    // Keep configured contexts in sync so a stale greeting is cleared.
    try {
      await updateContext(apiKey, configuredContextId, deliveryContext, fetchImpl);
    } catch {
      // Non-fatal: session can still start; speak_text delivery is unaffected.
    }
    return configuredContextId;
  }

  const existing = await findContextIdByName(apiKey, DELIVERY_CONTEXT_NAME, fetchImpl);
  if (existing) {
    await updateContext(apiKey, existing, deliveryContext, fetchImpl);
    return existing;
  }
  return createContext(apiKey, deliveryContext, fetchImpl);
}

export async function startLiveAvatarSession(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  options?: {
    startOnServer?: boolean;
    voiceSpeed?: number;
    voiceAffect?: LiveAvatarVoiceAffect;
    avatarExpression?: AvatarExpression;
  },
): Promise<StartLiveAvatarSessionResult | StartLiveAvatarSessionFailure> {
  try {
    const config = assertLiveAvatarReadyForSession(env);
    const mode = config.mode;
    const voiceSpeed = clampLiveAvatarVoiceSpeed(
      typeof options?.voiceSpeed === 'number'
        ? options.voiceSpeed
        : LIVEAVATAR_VOICE_SPEED_DEFAULT,
    );
    const fromExpression = options?.avatarExpression
      ? avatarExpressionToVoiceAffect(options.avatarExpression)
      : undefined;
    const voiceAffect: LiveAvatarVoiceAffect = {
      style: clampVoiceStyle(
        options?.voiceAffect?.style ?? fromExpression?.style ?? 0.15,
      ),
      stability: clampVoiceStability(
        options?.voiceAffect?.stability ?? fromExpression?.stability ?? 0.75,
      ),
    };

    let contextId: string | undefined = config.contextId;
    if (mode === 'FULL') {
      contextId = await resolveContextId(config.apiKey, config.contextId, fetchImpl);
    }

    const token = await createSessionToken(
      config.apiKey,
      {
        mode,
        avatarId: config.avatarId!,
        isSandbox: config.sandbox,
        contextId,
        voiceId: config.voiceId,
        language: 'en',
        voiceSpeed: mode === 'FULL' ? voiceSpeed : undefined,
        voiceStyle: mode === 'FULL' ? voiceAffect.style : undefined,
        voiceStability: mode === 'FULL' ? voiceAffect.stability : undefined,
      },
      fetchImpl,
    );

    const session: LiveAvatarSessionStartPayload = {
      sessionId: token.sessionId,
      sessionToken: token.sessionToken,
      sandbox: config.sandbox,
      avatarId: config.avatarId!,
      mode,
      voiceSpeed,
      voiceAffect,
      developmentMaxSessionSeconds: config.developmentMaxSessionSeconds,
    };

    if (options?.startOnServer) {
      const started = await startSession(token.sessionToken, fetchImpl);
      session.sessionId = started.sessionId ?? token.sessionId;
      session.livekitUrl = started.livekitUrl;
      session.livekitClientToken = started.livekitClientToken;
      session.wsUrl = started.wsUrl;
    }

    return { ok: true, session };
  } catch (error) {
    const code = error instanceof LiveAvatarError ? error.code : 'unknown';
    return { ok: false, error: publicErrorMessage(error), code };
  }
}

export async function endLiveAvatarSession(
  sessionToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  try {
    if (!sessionToken.trim()) {
      return { ok: false, error: 'sessionToken is required', code: 'configuration' };
    }
    await stopSession(sessionToken, fetchImpl);
    return { ok: true };
  } catch (error) {
    const code = error instanceof LiveAvatarError ? error.code : 'unknown';
    return { ok: false, error: publicErrorMessage(error), code };
  }
}

export async function keepAliveLiveAvatarSession(
  sessionToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  try {
    if (!sessionToken.trim()) {
      return { ok: false, error: 'sessionToken is required', code: 'configuration' };
    }
    await keepSessionAlive(sessionToken, fetchImpl);
    return { ok: true };
  } catch (error) {
    const code = error instanceof LiveAvatarError ? error.code : 'unknown';
    return { ok: false, error: publicErrorMessage(error), code };
  }
}
