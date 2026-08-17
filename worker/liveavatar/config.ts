import type { Env } from '../types';
import {
  LIVEAVATAR_LITE_AUDIO,
  LIVEAVATAR_LITE_CAPABILITIES,
  LIVEAVATAR_SANDBOX_AVATAR_ID,
  type LiveAvatarMode,
  type LiveAvatarPublicConfig,
  type LiveAvatarServerConfig,
} from './types';
import { LiveAvatarConfigurationError } from './errors';

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseMode(value: string | undefined): LiveAvatarMode {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'LITE') return 'LITE';
  return 'FULL';
}

/** Read Worker env into server config. Never return this object to the browser. */
export function readLiveAvatarServerConfig(env: Env): LiveAvatarServerConfig {
  const enabled = parseBool(env.LIVEAVATAR_ENABLED, false);
  const sandbox = parseBool(env.LIVEAVATAR_SANDBOX, true);
  const apiKey = env.LIVEAVATAR_API_KEY?.trim() ?? '';
  const mode = parseMode(env.LIVEAVATAR_MODE);
  const configuredAvatar = env.LIVEAVATAR_AVATAR_ID?.trim();
  const avatarId = sandbox
    ? LIVEAVATAR_SANDBOX_AVATAR_ID
    : configuredAvatar || undefined;

  return {
    enabled,
    sandbox,
    apiKey,
    avatarId,
    mode,
    contextId: env.LIVEAVATAR_CONTEXT_ID?.trim() || undefined,
    voiceId: env.LIVEAVATAR_VOICE_ID?.trim() || undefined,
    developmentMaxSessionSeconds: parsePositiveInt(env.LIVEAVATAR_DEV_MAX_SESSION_SECONDS),
    // FULL: LiveAvatar built-in TTS. LITE: Groq TTS (GROQ_API_KEY) or TTS_API_KEY.
    ttsConfigured:
      mode === 'FULL' ||
      Boolean(env.GROQ_API_KEY?.trim()) ||
      Boolean(env.TTS_API_KEY?.trim()),
  };
}

export function toLiveAvatarPublicConfig(server: LiveAvatarServerConfig): LiveAvatarPublicConfig {
  const keyPresent = Boolean(server.apiKey);
  const avatarConfigured = Boolean(server.avatarId);
  let missingReason: string | undefined;
  if (!server.enabled) {
    missingReason = 'LIVEAVATAR_ENABLED is false';
  } else if (!keyPresent) {
    missingReason = 'LIVEAVATAR_API_KEY missing';
  } else if (!avatarConfigured) {
    missingReason = 'LIVEAVATAR_AVATAR_ID missing';
  }

  return {
    enabled: server.enabled,
    sandbox: server.sandbox,
    configured: server.enabled && keyPresent && avatarConfigured,
    avatarConfigured,
    ttsConfigured: server.ttsConfigured,
    mode: server.mode,
    missingReason,
    audioFormat: LIVEAVATAR_LITE_AUDIO,
    capabilities: LIVEAVATAR_LITE_CAPABILITIES,
  };
}

export function getLiveAvatarPublicConfig(env: Env): LiveAvatarPublicConfig {
  return toLiveAvatarPublicConfig(readLiveAvatarServerConfig(env));
}

/**
 * Validate that a session may be started. Throws configuration errors
 * (never including the API key value).
 */
export function assertLiveAvatarReadyForSession(env: Env): LiveAvatarServerConfig {
  const config = readLiveAvatarServerConfig(env);
  if (!config.enabled) {
    throw new LiveAvatarConfigurationError('LiveAvatar is disabled');
  }
  if (!config.apiKey) {
    throw new LiveAvatarConfigurationError('LIVEAVATAR_API_KEY missing');
  }
  if (!config.avatarId) {
    throw new LiveAvatarConfigurationError('LIVEAVATAR_AVATAR_ID missing');
  }
  return config;
}
