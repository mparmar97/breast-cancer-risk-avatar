export type LiveAvatarStatus =
  | 'disabled'
  | 'not_configured'
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'error';

export type AvatarExpression =
  | 'neutral'
  | 'attentive'
  | 'reassuring'
  | 'gentle'
  | 'encouraging';

export interface LiveAvatarVoiceAffect {
  style: number;
  stability: number;
}

export interface LiveAvatarPublicConfig {
  enabled: boolean;
  sandbox: boolean;
  configured: boolean;
  avatarConfigured: boolean;
  ttsConfigured: boolean;
  mode?: 'FULL' | 'LITE';
  missingReason?: string;
  audioFormat: {
    encoding: string;
    sampleRateHz: number;
    channels: number;
    transport: string;
    firstChunkMs: number;
    subsequentChunkMs: number;
    maxPacketBytes: number;
  };
  capabilities: {
    facialExpression: boolean;
    gesture: boolean;
    gaze: boolean;
    pose: boolean;
    prosody: boolean;
  };
}

export interface LiveAvatarClientSession {
  sessionId: string;
  sessionToken: string;
  sandbox: boolean;
  avatarId: string;
  mode?: 'FULL' | 'LITE';
  voiceSpeed?: number;
  voiceAffect?: LiveAvatarVoiceAffect;
  developmentMaxSessionSeconds?: number;
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
  failureStage?: string;
  failureMessage?: string;
}

export interface EmbodimentPolicyView {
  deliveryTone: 'neutral' | 'warm' | 'supportive';
  speakingPace: 'normal' | 'slightly_slow';
  responseEnergy: 'neutral' | 'gentle' | 'positive';
  avatarExpression: AvatarExpression;
  explicitGestureControlSupported: boolean;
  explicitFacialExpressionControlSupported: boolean;
}

export interface LiveAvatarSessionExportMeta {
  avatarMode: 'live' | 'static';
  liveAvatarSandbox: boolean;
  liveAvatarSessionStarted: boolean;
  liveAvatarSessionDurationSeconds: number;
  liveAvatarFailures: number;
  avatarSpeechInterruptions: number;
  embodimentPoliciesUsed: string[];
}

export interface LiveAvatarDeveloperSnapshot {
  enabled: boolean;
  configured: boolean;
  mode: 'Sandbox' | 'Production' | 'unknown';
  avatarConfigured: boolean;
  apiKeyServerSideOnly: true;
  apiKeyExposedToClient: false;
  status: LiveAvatarStatus;
  sessionIdMasked: string;
  sessionDurationSeconds: number;
  reconnectAttempts: number;
  delivery: AvatarDeliveryMetadata | null;
  embodiment: EmbodimentPolicyView | null;
  /** Last voice_settings applied for FULL TTS (speed / style / stability). */
  appliedVoice: LiveAvatarVoiceAffect & { speed: number } | null;
  ttsProvider: string;
  audioFormat: string;
  staticAvatarActive: boolean;
  fallbackReason: string | null;
  permanentKeySentToBrowser: false;
  secretInFrontendBundle: false;
  /** When Groq TTS fails, browser speechSynthesis backup in use. */
  browserTtsFallback: null | {
    active: boolean;
    reason: 'rate_limit' | 'terms' | 'other' | null;
    voicePreference: 'device_default' | 'female_preferred' | null;
  };
}
