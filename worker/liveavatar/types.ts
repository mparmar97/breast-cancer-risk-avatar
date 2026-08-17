/**
 * LiveAvatar LITE Mode types (Phase 6).
 *
 * Official API (docs.liveavatar.com, v1):
 * - POST /v1/sessions/token (X-API-KEY)
 * - POST /v1/sessions/start (Bearer session_token)
 * - DELETE /v1/sessions (Bearer session_token)
 * - POST /v1/sessions/keep-alive (Bearer session_token)
 *
 * LITE audio over WebSocket: PCM 16-bit little-endian, 24 kHz mono, Base64.
 * LiveAvatar never decides medical content — it only delivers validated text.
 */

/** Server-only config — never serialize to the browser (contains apiKey). */
export interface LiveAvatarServerConfig {
  enabled: boolean;
  sandbox: boolean;
  apiKey: string;
  avatarId?: string;
  /** FULL uses LiveAvatar built-in TTS via speak_text; LITE needs app TTS. */
  mode: LiveAvatarMode;
  contextId?: string;
  voiceId?: string;
  developmentMaxSessionSeconds?: number;
  /**
   * True when speech can be delivered:
   * - FULL: LiveAvatar built-in TTS (no separate TTS_API_KEY required)
   * - LITE: local TTS_API_KEY / provider configured
   */
  ttsConfigured: boolean;
}

/** Safe subset exposed to React. */
export interface LiveAvatarPublicConfig {
  enabled: boolean;
  sandbox: boolean;
  configured: boolean;
  avatarConfigured: boolean;
  ttsConfigured: boolean;
  mode: LiveAvatarMode;
  missingReason?: string;
  /** Documented LITE audio requirement for developer panel. */
  audioFormat: LiveAvatarAudioFormat;
  capabilities: EmbodimentCapabilities;
}

export interface LiveAvatarAudioFormat {
  encoding: 'pcm_s16le';
  sampleRateHz: 24000;
  channels: 1;
  transport: 'websocket_base64';
  firstChunkMs: 600;
  subsequentChunkMs: 1000;
  maxPacketBytes: 1_048_576;
}

export interface EmbodimentCapabilities {
  facialExpression: boolean;
  gesture: boolean;
  gaze: boolean;
  pose: boolean;
  prosody: boolean;
}

/**
 * Short-lived session credentials safe for the browser (never includes API key).
 * The web SDK calls `/v1/sessions/start` with `sessionToken` and obtains
 * LiveKit / WebSocket URLs itself.
 */
export interface LiveAvatarClientSession {
  sessionId: string;
  /** Short-lived JWT from LiveAvatar — not the permanent API key. */
  sessionToken: string;
  sandbox: boolean;
  avatarId: string;
  developmentMaxSessionSeconds?: number;
  livekitUrl?: string;
  livekitClientToken?: string;
  wsUrl?: string;
}

export interface AvatarDeliveryRequest {
  assistantTurnId: string;
  validatedText: string;
}

export interface AvatarDeliveryMetadata {
  assistantTurnId: string;
  requested: boolean;
  speechGenerated: boolean;
  speechStarted: boolean;
  speechCompleted: boolean;
  interrupted: boolean;
  sessionId?: string;
  ttsProvider?: string;
  audioFormat?: string;
  failureStage?:
    | 'tts'
    | 'audio_conversion'
    | 'liveavatar_connection'
    | 'liveavatar_delivery'
    | 'session_ended'
    | 'tts_not_configured'
    | 'not_connected';
  failureMessage?: string;
}

export type LiveAvatarMode = 'FULL' | 'LITE';

export const LIVEAVATAR_API_BASE = 'https://api.liveavatar.com';

/** Official Sandbox Wayne avatar (docs.liveavatar.com/docs/sandbox-mode). */
export const LIVEAVATAR_SANDBOX_AVATAR_ID = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';

/**
 * Delivery-only context for FULL mode. The host app supplies verbatim text via
 * avatar.speak_text / SDK repeat(); LiveAvatar must not invent medical content.
 * Opening text is intentionally empty so the avatar stays silent until the
 * first validated chat reply is spoken.
 */
export const LIVEAVATAR_DELIVERY_CONTEXT_PROMPT =
  'You are Maya, a demonstration health-education presenter. ' +
  'Speak only the exact words provided by the host application. ' +
  'Do not invent medical advice, diagnoses, or treatment recommendations. ' +
  'If no host text is provided, remain silent.';

/** Empty = no auto-spoken greeting on session connect. */
export const LIVEAVATAR_DELIVERY_CONTEXT_OPENING = '';

export const LIVEAVATAR_LITE_AUDIO: LiveAvatarAudioFormat = {
  encoding: 'pcm_s16le',
  sampleRateHz: 24000,
  channels: 1,
  transport: 'websocket_base64',
  firstChunkMs: 600,
  subsequentChunkMs: 1000,
  maxPacketBytes: 1_048_576,
};

/**
 * Documented LITE visual controls are listening/idle poses via
 * agent.start_listening / agent.stop_listening — not arbitrary facial
 * expression or gesture APIs.
 */
export const LIVEAVATAR_LITE_CAPABILITIES: EmbodimentCapabilities = {
  facialExpression: false,
  gesture: false,
  gaze: false,
  pose: true,
  prosody: false,
};
