import { describe, expect, it, vi } from 'vitest';
import { deliverSpeech, interruptAvatarSpeech } from '../worker/liveavatar/deliverSpeech';
import { MockPcmTtsProvider } from '../worker/tts/provider';
import type { Env } from '../worker/types';
import worker from '../worker/index';
import { LIVEAVATAR_SANDBOX_AVATAR_ID } from '../worker/liveavatar/types';

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;

const baseEnv: Env = {
  ASSETS: assets,
  LIVEAVATAR_ENABLED: 'true',
  LIVEAVATAR_SANDBOX: 'true',
  LIVEAVATAR_AVATAR_ID: LIVEAVATAR_SANDBOX_AVATAR_ID,
};

describe('Avatar delivery integrity', () => {
  it('passes exact validated text to TTS and records matching turn id', async () => {
    const text =
      'A 3.2% five-year result is an educational estimate, not a diagnosis.';
    const sent: Record<string, unknown>[] = [];
    let interrupted = false;
    const transport = {
      send: async (payload: Record<string, unknown>) => {
        sent.push(payload);
      },
      waitForConnected: async () => undefined,
      waitForSpeakEnded: async () => undefined,
      isInterrupted: () => interrupted,
    };

    const meta = await deliverSpeech({
      env: baseEnv,
      request: { assistantTurnId: 'turn-1', validatedText: text },
      connected: true,
      sessionId: 'sess-1',
      transport,
      ttsProvider: new MockPcmTtsProvider(100),
    });

    expect(meta.assistantTurnId).toBe('turn-1');
    expect(meta.speechGenerated).toBe(true);
    expect(meta.speechStarted).toBe(true);
    expect(meta.speechCompleted).toBe(true);
    expect(meta.ttsProvider).toBe('mock-pcm');
    expect(sent.some((p) => p.type === 'agent.speak')).toBe(true);
    expect(sent.some((p) => p.type === 'agent.speak_end')).toBe(true);
  });

  it('reports tts_not_configured without contacting LiveAvatar', async () => {
    const send = vi.fn();
    const meta = await deliverSpeech({
      env: baseEnv,
      request: { assistantTurnId: 'turn-2', validatedText: 'Hello' },
      connected: true,
      transport: { send },
    });
    expect(meta.failureStage).toBe('tts_not_configured');
    expect(send).not.toHaveBeenCalled();
  });

  it('supports interrupt without dropping text identity responsibility', async () => {
    const sent: Record<string, unknown>[] = [];
    const transport = {
      send: async (payload: Record<string, unknown>) => {
        sent.push(payload);
      },
    };
    await interruptAvatarSpeech(transport);
    expect(sent).toEqual([{ type: 'agent.interrupt' }]);
  });

  it('prepare-speech FULL mode keeps validatedText identical for speak_text', async () => {
    const validated =
      'This demonstration cannot tell you whether you have breast cancer.';
    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/prepare-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantTurnId: 'safety-turn',
          validatedText: validated,
          connected: true,
          adaptiveState: {
            understanding: 'uncertain',
            emotion: 'worried',
            barrier: 'fear',
            selfEfficacy: 'unknown',
            readiness: 'unclear',
            safetyFlag: 'diagnosis_request',
            confidence: 0.9,
          },
          currentTurnEvidence: { emotion: 'Does this mean I have breast cancer?' },
        }),
      }),
      { ...baseEnv, LIVEAVATAR_MODE: 'FULL' },
      {} as ExecutionContext,
    );
    const body = (await response.json()) as {
      mode: string;
      tts: { validatedText?: string; ok: boolean; delivery?: string; provider?: string };
      embodiment: { deliveryTone: string; speakingPace: string; avatarExpression: string };
      voiceSpeed: number;
      voiceAffect: { style: number; stability: number };
      delivery: { assistantTurnId: string; ttsProvider?: string };
    };
    expect(body.mode).toBe('FULL');
    expect(body.delivery.assistantTurnId).toBe('safety-turn');
    expect(body.tts.ok).toBe(true);
    expect(body.tts.delivery).toBe('speak_text');
    expect(body.tts.provider).toBe('liveavatar-full');
    expect(body.tts.validatedText).toBe(validated);
    expect(body.embodiment.deliveryTone).toBe('supportive');
    expect(body.embodiment.speakingPace).toBe('slightly_slow');
    expect(body.embodiment.avatarExpression).toBe('reassuring');
    expect(body.voiceSpeed).toBe(0.8);
    expect(body.voiceAffect.style).toBeGreaterThan(0);
  });

  it('prepare-speech LITE mode uses app TTS and keeps validatedText identical', async () => {
    const validated =
      'A risk estimate is an educational demonstration result, not a diagnosis.';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/audio/speech')) {
        // Minimal valid WAV (44-byte header + 2 samples)
        const wav = new Uint8Array(48);
        wav.set([0x52, 0x49, 0x46, 0x46], 0);
        wav.set([0x57, 0x41, 0x56, 0x45], 8);
        wav.set([0x66, 0x6d, 0x74, 0x20], 12);
        const view = new DataView(wav.buffer);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24_000, true);
        view.setUint32(28, 48_000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        wav.set([0x64, 0x61, 0x74, 0x61], 36);
        view.setUint32(40, 4, true);
        return new Response(wav.buffer, { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/prepare-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantTurnId: 'lite-turn',
          validatedText: validated,
          connected: true,
        }),
      }),
      {
        ...baseEnv,
        LIVEAVATAR_MODE: 'LITE',
        GROQ_API_KEY: 'gsk_test_lite',
      },
      {} as ExecutionContext,
    );
    vi.unstubAllGlobals();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mode: string;
      tts: { ok: boolean; delivery?: string; provider?: string; validatedText?: string };
    };
    expect(body.mode).toBe('LITE');
    expect(body.tts.ok).toBe(true);
    expect(body.tts.delivery).toBe('speak_audio');
    expect(body.tts.provider).toBe('groq-orpheus');
    expect(body.tts.validatedText).toBe(validated);
  });
});
