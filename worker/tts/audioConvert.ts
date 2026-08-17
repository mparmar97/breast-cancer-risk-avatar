import {
  LIVEAVATAR_TARGET_CHANNELS,
  LIVEAVATAR_TARGET_ENCODING,
  LIVEAVATAR_TARGET_SAMPLE_RATE,
} from './types';
import { LiveAvatarAudioError } from '../liveavatar/errors';

export interface NormalizedPcmAudio {
  /** Raw PCM bytes (copied into a fresh ArrayBuffer-backed view). */
  pcm: Uint8Array<ArrayBuffer>;
  sampleRate: number;
  channels: number;
  encoding: typeof LIVEAVATAR_TARGET_ENCODING;
}

function asBytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

interface WavPcmPayload {
  pcm: Uint8Array;
  sampleRate: number;
  channels: number;
}

/** Parse a RIFF/WAVE PCM payload; falls back to stripping a 44-byte header. */
export function extractPcmFromWav(bytes: Uint8Array): WavPcmPayload | null {
  if (
    bytes.length < 44 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 24_000;
  let channels = 1;
  let bitsPerSample = 16;
  let data: Uint8Array | null = null;

  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(bytes.length, chunkStart + size);

    if (id === 'fmt ' && size >= 16) {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === 'data') {
      data = bytes.subarray(chunkStart, chunkEnd);
      break;
    }

    offset = chunkStart + size + (size % 2);
  }

  if (!data || bitsPerSample !== 16) {
    // Legacy fallback for simple 44-byte PCM headers.
    return {
      pcm: bytes.subarray(44),
      sampleRate: sampleRate || 24_000,
      channels: channels || 1,
    };
  }

  return { pcm: data, sampleRate, channels };
}

/**
 * Validate / lightly normalize TTS output for LiveAvatar LITE.
 * Does not use an LLM. Supports already-correct PCM and simple mono
 * resampling via linear interpolation when sample rates differ.
 */
export function normalizeToLiveAvatarPcm(
  audio: ArrayBuffer,
  options: { sampleRate?: number; channels?: number; mimeOrEncoding?: string },
): NormalizedPcmAudio {
  const encoding = (options.mimeOrEncoding ?? '').toLowerCase();
  if (encoding && !encoding.includes('pcm') && !encoding.includes('raw') && !encoding.includes('wav')) {
    throw new LiveAvatarAudioError(
      `Unsupported TTS encoding for LiveAvatar LITE: ${options.mimeOrEncoding}`,
    );
  }

  let bytes = new Uint8Array(audio);
  let sourceRate = options.sampleRate ?? LIVEAVATAR_TARGET_SAMPLE_RATE;
  let sourceChannels = options.channels ?? LIVEAVATAR_TARGET_CHANNELS;

  const wav = extractPcmFromWav(bytes);
  if (wav) {
    bytes = wav.pcm;
    sourceRate = options.sampleRate ?? wav.sampleRate;
    sourceChannels = options.channels ?? wav.channels;
  }

  if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) {
    throw new LiveAvatarAudioError('PCM audio buffer is empty or misaligned');
  }

  if (sourceChannels !== 1 && sourceChannels !== 2) {
    throw new LiveAvatarAudioError('Only mono or stereo PCM is supported for conversion');
  }

  const mono = asBytes(sourceChannels === 2 ? downmixStereoToMono(bytes) : bytes);

  const pcm =
    sourceRate === LIVEAVATAR_TARGET_SAMPLE_RATE
      ? mono
      : asBytes(resamplePcm16Mono(mono, sourceRate, LIVEAVATAR_TARGET_SAMPLE_RATE));

  return {
    pcm,
    sampleRate: LIVEAVATAR_TARGET_SAMPLE_RATE,
    channels: LIVEAVATAR_TARGET_CHANNELS,
    encoding: LIVEAVATAR_TARGET_ENCODING,
  };
}

function downmixStereoToMono(stereo: Uint8Array): Uint8Array {
  const view = new DataView(stereo.buffer, stereo.byteOffset, stereo.byteLength);
  const frames = Math.floor(stereo.byteLength / 4);
  const out = new Uint8Array(frames * 2);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < frames; i += 1) {
    const left = view.getInt16(i * 4, true);
    const right = view.getInt16(i * 4 + 2, true);
    const mixed = Math.max(-32768, Math.min(32767, Math.round((left + right) / 2)));
    outView.setInt16(i * 2, mixed, true);
  }
  return out;
}

function resamplePcm16Mono(input: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (fromRate <= 0 || toRate <= 0) {
    throw new LiveAvatarAudioError('Invalid sample rate for resampling');
  }
  const inView = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const inSamples = Math.floor(input.byteLength / 2);
  const outSamples = Math.max(1, Math.floor((inSamples * toRate) / fromRate));
  const out = new Uint8Array(outSamples * 2);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < outSamples; i += 1) {
    const srcIndex = (i * fromRate) / toRate;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(inSamples - 1, i0 + 1);
    const frac = srcIndex - i0;
    const s0 = inView.getInt16(i0 * 2, true);
    const s1 = inView.getInt16(i1 * 2, true);
    const sample = Math.max(-32768, Math.min(32767, Math.round(s0 + (s1 - s0) * frac)));
    outView.setInt16(i * 2, sample, true);
  }
  return out;
}

/** Split PCM into LiveAvatar-recommended chunk sizes (600ms first, then 1s). */
export function chunkPcmForLiveAvatar(
  pcm: Uint8Array,
  sampleRate = LIVEAVATAR_TARGET_SAMPLE_RATE,
): Uint8Array[] {
  const bytesPerSecond = sampleRate * 2; // 16-bit mono
  const first = Math.floor(bytesPerSecond * 0.6);
  const next = bytesPerSecond;
  const maxPacket = 1_048_576;
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let isFirst = true;
  while (offset < pcm.byteLength) {
    const target = Math.min(isFirst ? first : next, maxPacket);
    const end = Math.min(pcm.byteLength, offset + target);
    chunks.push(pcm.subarray(offset, end));
    offset = end;
    isFirst = false;
  }
  return chunks;
}

export function pcmToBase64(pcm: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < pcm.length; i += chunkSize) {
    const slice = pcm.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
