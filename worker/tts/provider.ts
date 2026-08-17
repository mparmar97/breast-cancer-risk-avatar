import type { Env } from '../types';
import { createGroqTtsProvider } from './groqTts';
import {
  TtsNotConfiguredError,
  type TtsProvider,
  type TtsRequest,
  type TtsResult,
} from './types';

/**
 * Placeholder provider used until a real TTS credential is configured.
 * Never invents credentials or calls a paid service.
 */
export class NotConfiguredTtsProvider implements TtsProvider {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  async synthesize(_request: TtsRequest): Promise<TtsResult> {
    throw new TtsNotConfiguredError(
      'LiveAvatar LITE speech requires Groq TTS (GROQ_API_KEY) or another TTS provider.',
    );
  }
}

/**
 * Test-only / injectable mock that returns silence PCM at 24 kHz mono.
 * Not used in production unless explicitly constructed by tests.
 */
export class MockPcmTtsProvider implements TtsProvider {
  readonly name = 'mock-pcm';

  constructor(private readonly durationMs = 200) {}

  isConfigured(): boolean {
    return true;
  }

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const sampleRate = 24_000;
    const samples = Math.max(1, Math.floor((sampleRate * this.durationMs) / 1000));
    const buffer = new ArrayBuffer(samples * 2);
    // Keep silence — content identity is proven via the text path, not audio bytes.
    void request.text;
    return {
      audio: buffer,
      mimeOrEncoding: 'pcm_s16le',
      sampleRate,
      channels: 1,
      durationMs: this.durationMs,
      provider: this.name,
    };
  }
}

export function createTtsProvider(env: Env): TtsProvider {
  // Prefer Groq TTS for LITE (reuses GROQ_API_KEY; no LiveAvatar FULL TTS credits).
  const groq = createGroqTtsProvider(env);
  if (groq?.isConfigured()) return groq;

  // Optional dedicated TTS key reserved for a future non-Groq adapter.
  if (env.TTS_API_KEY?.trim()) {
    return new NotConfiguredTtsProvider();
  }
  return new NotConfiguredTtsProvider();
}
