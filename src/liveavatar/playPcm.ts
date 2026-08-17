/**
 * Play raw PCM s16le mono (base64) in the browser.
 * Used for LiveAvatar LITE so the user reliably hears Groq TTS even when
 * the LiveKit remote audio track is muted or blocked by autoplay policy.
 *
 * Safari/iOS: HTMLAudio WAV is more reliable than a fresh AudioContext.
 */

import { isSafariBrowser, resumeSharedAudioContext } from './audioUnlock';

function decodeBase64Pcm(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const frameCount = Math.floor(bytes.byteLength / 2);
  const samples = new Int16Array(frameCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * 2);
  for (let i = 0; i < frameCount; i += 1) {
    samples[i] = view.getInt16(i * 2, true);
  }
  return samples;
}

export function pcmS16leToWavBlob(samples: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i] ?? 0, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function playWavElement(
  blob: Blob,
  signal?: AbortSignal,
): { stop: () => void; ended: Promise<void> } {
  const url = URL.createObjectURL(blob);
  const audio = document.createElement('audio');
  audio.src = url;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', 'true');
  audio.volume = 1;

  let stopped = false;
  const cleanup = () => {
    URL.revokeObjectURL(url);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    cleanup();
  };

  if (signal) {
    if (signal.aborted) {
      stop();
      return { stop, ended: Promise.resolve() };
    }
    signal.addEventListener('abort', stop, { once: true });
  }

  const ended = new Promise<void>((resolve) => {
    audio.onended = () => {
      stop();
      resolve();
    };
    audio.onerror = () => {
      stop();
      resolve();
    };
  });

  void audio.play().catch(() => {
    stop();
  });

  return { stop, ended };
}

async function playViaWebAudio(
  samples: Int16Array,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<{ stop: () => void; ended: Promise<void> } | null> {
  const ctx = await resumeSharedAudioContext();
  if (!ctx) return null;

  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    channel[i] = (samples[i] ?? 0) / 32768;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      source.stop();
    } catch {
      // already stopped
    }
  };

  if (signal) {
    if (signal.aborted) {
      stop();
      return { stop, ended: Promise.resolve() };
    }
    signal.addEventListener('abort', stop, { once: true });
  }

  const ended = new Promise<void>((resolve) => {
    source.onended = () => {
      stop();
      resolve();
    };
  });

  try {
    source.start();
  } catch {
    stop();
    return null;
  }
  return { stop, ended };
}

export function playPcmS16leBase64(
  base64: string,
  options?: { sampleRate?: number; signal?: AbortSignal },
): { stop: () => void; ended: Promise<void> } {
  const sampleRate = options?.sampleRate ?? 24_000;
  const samples = decodeBase64Pcm(base64);
  if (samples.length < 1) {
    return { stop: () => undefined, ended: Promise.resolve() };
  }

  const blob = pcmS16leToWavBlob(samples, sampleRate);

  // Safari/iOS: HTMLAudio after a user-gesture unlock is the reliable path.
  if (typeof window !== 'undefined' && isSafariBrowser()) {
    return playWavElement(blob, options?.signal);
  }

  let stopFn = () => undefined as void;
  const ended = (async () => {
    const web = await playViaWebAudio(samples, sampleRate, options?.signal);
    if (web) {
      stopFn = web.stop;
      await web.ended;
      return;
    }
    const html = playWavElement(blob, options?.signal);
    stopFn = html.stop;
    await html.ended;
  })();

  return {
    stop: () => stopFn(),
    ended,
  };
}
