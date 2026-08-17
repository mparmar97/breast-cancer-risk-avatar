import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  chunkTextForOrpheus,
  GroqTtsProvider,
  ORPHEUS_MAX_INPUT_CHARS,
} from '../worker/tts/groqTts';
import { normalizeToLiveAvatarPcm } from '../worker/tts/audioConvert';
import { isGroqTtsTermsError } from '../src/liveavatar/browserTts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeSilentWav(sampleRate = 24_000, samples = 240): ArrayBuffer {
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  return buffer;
}

describe('isGroqTtsTermsError', () => {
  it('matches real terms-acceptance failures only', () => {
    expect(
      isGroqTtsTermsError(
        'Groq Orpheus TTS requires a one-time terms acceptance. Org admin: open https://console.groq.com/...',
      ),
    ).toBe(true);
    expect(
      isGroqTtsTermsError(
        'The model `canopylabs/orpheus-v1-english` requires terms acceptance.',
      ),
    ).toBe(true);
  });

  it('does not treat generic Orpheus/TTS failures as terms errors', () => {
    expect(
      isGroqTtsTermsError(
        'Groq TTS failed (400): {"error":{"message":"input too long for canopylabs/orpheus-v1-english"}}',
      ),
    ).toBe(false);
    expect(isGroqTtsTermsError('Browser voice fallback')).toBe(false);
  });
});

describe('chunkTextForOrpheus', () => {
  it('keeps short text as one chunk', () => {
    expect(chunkTextForOrpheus('A risk estimate is not a diagnosis.')).toEqual([
      'A risk estimate is not a diagnosis.',
    ]);
  });

  it('splits long replies under the Orpheus character limit', () => {
    const long =
      'A demonstration risk estimate describes chance over time for people with similar calculator information. ' +
      'It is a probability estimate, not a diagnosis of current cancer. ' +
      'A qualified healthcare professional can interpret it with your fuller personal and family history. ' +
      'A general next step many people choose is to share the demonstration estimate at an existing visit.';
    const chunks = chunkTextForOrpheus(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(ORPHEUS_MAX_INPUT_CHARS);
    }
    expect(chunks.join(' ')).toContain('not a diagnosis');
  });
});

describe('GroqTtsProvider', () => {
  it('is configured only when API key present', () => {
    expect(new GroqTtsProvider('').isConfigured()).toBe(false);
    expect(new GroqTtsProvider('gsk_test').isConfigured()).toBe(true);
  });

  it('calls Groq speech API with wav + adaptive speed', async () => {
    const fetchMock = vi.fn(async () => new Response(makeSilentWav(), { status: 200 }));
    const provider = new GroqTtsProvider('gsk_test', { fetchImpl: fetchMock as unknown as typeof fetch });
    const result = await provider.synthesize({
      text: 'A risk estimate is not a diagnosis.',
      delivery: { pace: 'slightly_slow', speed: 0.8 },
    });
    expect(result.provider).toBe('groq-orpheus');
    expect(result.mimeOrEncoding).toBe('wav');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      model: string;
      voice: string;
      input: string;
      sample_rate: number;
      speed: number;
    };
    expect(body.input).toBe('A risk estimate is not a diagnosis.');
    expect(body.sample_rate).toBe(24_000);
    expect(body.speed).toBe(0.8);
    expect(body.model).toContain('orpheus');
  });

  it('chunks long text into multiple Orpheus requests and merges audio', async () => {
    const fetchMock = vi.fn(async () => new Response(makeSilentWav(24_000, 120), { status: 200 }));
    const provider = new GroqTtsProvider('gsk_test', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const long =
      'A demonstration risk estimate describes chance over time for people with similar calculator information. ' +
      'It is a probability estimate, not a diagnosis of current cancer. ' +
      'A qualified healthcare professional can interpret it with your fuller personal and family history.';
    const result = await provider.synthesize({ text: long });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(String((call[1] as RequestInit).body)) as { input: string };
      expect(body.input.length).toBeLessThanOrEqual(ORPHEUS_MAX_INPUT_CHARS);
    }
    expect(result.mimeOrEncoding).toBe('wav');
    expect(result.audio.byteLength).toBeGreaterThan(44);
  });

  it('surfaces Orpheus terms-acceptance errors clearly', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              'The model `canopylabs/orpheus-v1-english` requires terms acceptance. Please have the org admin accept the terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english',
            type: 'invalid_request_error',
          },
        }),
        { status: 400 },
      ),
    );
    const provider = new GroqTtsProvider('gsk_test', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize({ text: 'A risk estimate is not a diagnosis.' }),
    ).rejects.toThrow(/terms acceptance/i);
  });
});

describe('normalizeToLiveAvatarPcm wav', () => {
  it('extracts PCM from a standard WAV header', () => {
    const wav = makeSilentWav(24_000, 480);
    const normalized = normalizeToLiveAvatarPcm(wav, { mimeOrEncoding: 'wav' });
    expect(normalized.sampleRate).toBe(24_000);
    expect(normalized.channels).toBe(1);
    expect(normalized.pcm.byteLength).toBe(480 * 2);
  });
});
