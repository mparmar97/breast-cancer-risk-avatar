import type { Env } from '../types';
import {
  TtsNotConfiguredError,
  TtsSynthesisError,
  type TtsProvider,
  type TtsRequest,
  type TtsResult,
} from './types';
import { extractPcmFromWav } from './audioConvert';

const GROQ_SPEECH_URL = 'https://api.groq.com/openai/v1/audio/speech';
export const DEFAULT_GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english';
export const DEFAULT_GROQ_TTS_VOICE = 'hannah';
export const GROQ_ORPHEUS_TERMS_URL =
  'https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english';

/** Orpheus English API limit (characters). Longer replies must be chunked. */
export const ORPHEUS_MAX_INPUT_CHARS = 200;

/**
 * Groq Orpheus TTS for LiveAvatar LITE.
 * Uses the existing GROQ_API_KEY — no separate LiveAvatar FULL TTS credits.
 *
 * First-time setup: org admin must accept Orpheus terms in the Groq console
 * (see GROQ_ORPHEUS_TERMS_URL). Until then, the API returns 400.
 */
export class GroqTtsProvider implements TtsProvider {
  readonly name = 'groq-orpheus';

  constructor(
    private readonly apiKey: string,
    private readonly options?: {
      model?: string;
      voice?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey.trim());
  }

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    if (!this.isConfigured()) {
      throw new TtsNotConfiguredError('GROQ_API_KEY missing for LITE TTS');
    }

    const text = request.text.trim();
    if (!text) {
      throw new TtsSynthesisError('validatedText is empty');
    }

    const chunks = chunkTextForOrpheus(text, ORPHEUS_MAX_INPUT_CHARS);
    const wavParts: ArrayBuffer[] = [];
    for (const chunk of chunks) {
      wavParts.push(await this.synthesizeChunk(chunk, request));
    }

    const merged = mergeWavPcmParts(wavParts);
    return {
      audio: merged,
      mimeOrEncoding: 'wav',
      channels: 1,
      provider: this.name,
    };
  }

  private async synthesizeChunk(text: string, request: TtsRequest): Promise<ArrayBuffer> {
    const speed = resolveTtsSpeed(request);
    const fetchImpl = this.options?.fetchImpl ?? fetch;
    const model = this.options?.model?.trim() || DEFAULT_GROQ_TTS_MODEL;
    const voice = this.options?.voice?.trim() || DEFAULT_GROQ_TTS_VOICE;
    const payloadBase = {
      model,
      voice,
      input: text,
      response_format: 'wav' as const,
      speed,
    };

    // Prefer 24 kHz for LiveAvatar LITE; fall back if the API rejects sample_rate.
    let response = await fetchImpl(GROQ_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payloadBase, sample_rate: 24_000 }),
    });

    let errorBody = '';
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      errorBody = await response.text();
      if (!/terms acceptance/i.test(errorBody)) {
        response = await fetchImpl(GROQ_SPEECH_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadBase),
        });
        errorBody = '';
      }
    }

    if (!response.ok) {
      const detail = (errorBody || (await response.text())).slice(0, 400);
      if (/terms acceptance|model_terms_required/i.test(detail)) {
        throw new TtsSynthesisError(
          `Groq Orpheus TTS requires a one-time terms acceptance. ` +
            `Org admin: open ${GROQ_ORPHEUS_TERMS_URL} and accept the model terms, then retry.`,
        );
      }
      if (response.status === 429 || /rate_limit_exceeded|tokens per day|TPD/i.test(detail)) {
        const retryHint = detail.match(/try again in ([^."]+)/i)?.[1]?.trim();
        throw new TtsSynthesisError(
          `Groq Orpheus daily TTS limit reached` +
            (retryHint ? ` (try again in ${retryHint})` : '') +
            `. Using browser voice until the limit resets, or upgrade Groq Dev Tier.`,
        );
      }
      throw new TtsSynthesisError(
        `Groq TTS failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength < 44) {
      throw new TtsSynthesisError('Groq TTS returned empty audio');
    }
    return audio;
  }
}

/**
 * Split validated speech into Orpheus-sized chunks without rewriting meaning.
 * Prefers sentence / clause boundaries; hard-splits only when a single span is too long.
 */
export function chunkTextForOrpheus(text: string, maxChars = ORPHEUS_MAX_INPUT_CHARS): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const part = current.trim();
    if (part) chunks.push(part);
    current = '';
  };

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      pushCurrent();
      for (const hard of hardSplit(piece, maxChars)) chunks.push(hard);
      continue;
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      pushCurrent();
      current = piece;
    }
  }
  pushCurrent();
  return chunks;
}

function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < Math.floor(maxChars * 0.5)) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/** Concatenate one or more WAV PCM responses into a single WAV buffer. */
export function mergeWavPcmParts(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 0) {
    throw new TtsSynthesisError('No TTS audio parts to merge');
  }
  if (parts.length === 1) return parts[0];

  const pcmChunks: Uint8Array[] = [];
  let sampleRate = 24_000;
  let channels = 1;

  for (const part of parts) {
    const bytes = new Uint8Array(part);
    const extracted = extractPcmFromWav(bytes);
    if (!extracted) {
      throw new TtsSynthesisError('Could not parse Groq WAV chunk');
    }
    sampleRate = extracted.sampleRate || sampleRate;
    channels = extracted.channels || channels;
    pcmChunks.push(extracted.pcm);
  }

  const totalPcm = pcmChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const buffer = new ArrayBuffer(44 + totalPcm);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalPcm, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalPcm, true);

  let offset = 44;
  for (const chunk of pcmChunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function resolveTtsSpeed(request: TtsRequest): number {
  if (typeof request.delivery?.speed === 'number' && Number.isFinite(request.delivery.speed)) {
    return clampSpeed(request.delivery.speed);
  }
  if (request.delivery?.pace === 'slightly_slow') return 0.85;
  return 1;
}

function clampSpeed(speed: number): number {
  // Groq docs: 0.5–5; keep near conversational range.
  return Math.min(1.5, Math.max(0.7, speed));
}

export function createGroqTtsProvider(env: Env, fetchImpl?: typeof fetch): GroqTtsProvider | null {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new GroqTtsProvider(key, {
    model: env.GROQ_TTS_MODEL,
    voice: env.GROQ_TTS_VOICE,
    fetchImpl,
  });
}
