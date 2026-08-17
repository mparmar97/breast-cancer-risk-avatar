export interface TtsRequest {
  text: string;
  delivery?: {
    tone?: 'neutral' | 'warm' | 'supportive';
    pace?: 'normal' | 'slightly_slow';
    /** Absolute speaking rate hint for app-side TTS (e.g. Groq). */
    speed?: number;
  };
}

export interface TtsResult {
  audio: ArrayBuffer;
  mimeOrEncoding: string;
  sampleRate?: number;
  channels?: number;
  durationMs?: number;
  provider: string;
}

export type TtsStatus = 'configured' | 'not_configured' | 'failed';

export interface TtsProvider {
  readonly name: string;
  isConfigured(): boolean;
  synthesize(request: TtsRequest): Promise<TtsResult>;
}

export class TtsNotConfiguredError extends Error {
  constructor(message = 'TTS provider is not configured') {
    super(message);
    this.name = 'TtsNotConfiguredError';
  }
}

export class TtsSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsSynthesisError';
  }
}

/** LiveAvatar LITE target (docs.liveavatar.com LITE audio). */
export const LIVEAVATAR_TARGET_SAMPLE_RATE = 24_000;
export const LIVEAVATAR_TARGET_CHANNELS = 1;
export const LIVEAVATAR_TARGET_ENCODING = 'pcm_s16le';
