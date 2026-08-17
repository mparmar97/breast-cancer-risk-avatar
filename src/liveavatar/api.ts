import type {
  AvatarDeliveryMetadata,
  EmbodimentPolicyView,
  LiveAvatarClientSession,
  LiveAvatarPublicConfig,
} from './types';

interface ApiErrorBody {
  error?: string;
  code?: string;
  reason?: string;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as ApiErrorBody;
      if (errorBody.error) message = errorBody.error;
    } catch {
      // keep generic
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchLiveAvatarConfig(): Promise<LiveAvatarPublicConfig> {
  const response = await fetch('/api/liveavatar/config');
  return parseJsonOrThrow<LiveAvatarPublicConfig>(response);
}

export async function startLiveAvatarSessionApi(options?: {
  voiceSpeed?: number;
  speakingPace?: 'normal' | 'slightly_slow';
  voiceStyle?: number;
  voiceStability?: number;
  avatarExpression?: string;
}): Promise<{
  session: LiveAvatarClientSession;
  mode: string;
}> {
  const response = await fetch('/api/liveavatar/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(typeof options?.voiceSpeed === 'number' ? { voiceSpeed: options.voiceSpeed } : {}),
      ...(options?.speakingPace ? { speakingPace: options.speakingPace } : {}),
      ...(typeof options?.voiceStyle === 'number' ? { voiceStyle: options.voiceStyle } : {}),
      ...(typeof options?.voiceStability === 'number'
        ? { voiceStability: options.voiceStability }
        : {}),
      ...(options?.avatarExpression ? { avatarExpression: options.avatarExpression } : {}),
    }),
  });
  return parseJsonOrThrow(response);
}

export async function endLiveAvatarSessionApi(sessionToken: string): Promise<void> {
  const response = await fetch('/api/liveavatar/session/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });
  await parseJsonOrThrow<{ ok: boolean }>(response);
}

export async function keepAliveLiveAvatarSessionApi(sessionToken: string): Promise<void> {
  const response = await fetch('/api/liveavatar/session/keep-alive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });
  await parseJsonOrThrow<{ ok: boolean }>(response);
}

export interface PrepareSpeechResponse {
  delivery: AvatarDeliveryMetadata;
  embodiment: EmbodimentPolicyView;
  embodimentPolicyLabel: string;
  /** Mapped from speakingPace for LiveAvatar FULL voice_settings.speed. */
  voiceSpeed?: number;
  /** Mapped from avatarExpression for LiveAvatar FULL voice_settings style/stability. */
  voiceAffect?: { style: number; stability: number };
  mode?: 'FULL' | 'LITE';
  tts:
    | {
        ok: true;
        provider: string;
        delivery?: 'speak_text' | 'speak_audio';
        sampleRate?: number;
        channels?: number;
        encoding?: string;
        audioBase64?: string;
        validatedText: string;
        assistantTurnId: string;
      }
    | {
        ok: false;
        reason: string;
        message: string;
        validatedText: string;
        assistantTurnId: string;
      };
}

export async function prepareAvatarSpeech(body: {
  assistantTurnId: string;
  validatedText: string;
  connected: boolean;
  sessionId?: string;
  adaptiveState?: unknown;
  currentTurnEvidence?: unknown;
}): Promise<PrepareSpeechResponse> {
  const response = await fetch('/api/liveavatar/prepare-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<PrepareSpeechResponse>(response);
}
