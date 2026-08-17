import type { Env } from '../types';
import { createTtsProvider } from './provider';
import {
  TtsNotConfiguredError,
  type TtsProvider,
  type TtsRequest,
  type TtsResult,
} from './types';
import { normalizeToLiveAvatarPcm, type NormalizedPcmAudio } from './audioConvert';

export interface CreateSpeechResult {
  ok: true;
  tts: TtsResult;
  normalized: NormalizedPcmAudio;
}

export interface CreateSpeechFailure {
  ok: false;
  reason: 'tts_not_configured' | 'tts_failed' | 'audio_conversion';
  message: string;
}

/**
 * Provider-independent TTS entrypoint. Preserves text identity — no LLM rewrite.
 */
export async function createSpeech(
  env: Env,
  request: TtsRequest,
  provider?: TtsProvider,
): Promise<CreateSpeechResult | CreateSpeechFailure> {
  const text = request.text.trim();
  if (!text) {
    return { ok: false, reason: 'tts_failed', message: 'validatedText is empty' };
  }

  const tts = provider ?? createTtsProvider(env);
  if (!tts.isConfigured()) {
    return {
      ok: false,
      reason: 'tts_not_configured',
      message: 'Production LiveAvatar speech requires a configured TTS provider.',
    };
  }

  try {
    const result = await tts.synthesize({ ...request, text });
    try {
      const normalized = normalizeToLiveAvatarPcm(result.audio, {
        sampleRate: result.sampleRate,
        channels: result.channels,
        mimeOrEncoding: result.mimeOrEncoding,
      });
      return { ok: true, tts: result, normalized };
    } catch (error) {
      return {
        ok: false,
        reason: 'audio_conversion',
        message: error instanceof Error ? error.message : 'Audio conversion failed',
      };
    }
  } catch (error) {
    if (error instanceof TtsNotConfiguredError) {
      return {
        ok: false,
        reason: 'tts_not_configured',
        message: error.message,
      };
    }
    return {
      ok: false,
      reason: 'tts_failed',
      message: error instanceof Error ? error.message : 'TTS synthesis failed',
    };
  }
}
