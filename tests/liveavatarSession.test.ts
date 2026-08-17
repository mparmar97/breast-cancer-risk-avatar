import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from '../worker/index';
import { LIVEAVATAR_SANDBOX_AVATAR_ID } from '../worker/liveavatar/types';

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;
const FAKE_KEY = 'TEST_LIVEAVATAR_SECRET_DO_NOT_EXPOSE';

afterEach(() => {
  vi.unstubAllGlobals();
});

function env(partial: Partial<Env> = {}): Env {
  return {
    ASSETS: assets,
    LIVEAVATAR_ENABLED: 'true',
    LIVEAVATAR_SANDBOX: 'true',
    LIVEAVATAR_AVATAR_ID: LIVEAVATAR_SANDBOX_AVATAR_ID,
    LIVEAVATAR_API_KEY: FAKE_KEY,
    ...partial,
  };
}

describe('LiveAvatar session lifecycle (mocked provider)', () => {
  it('creates a sandbox FULL token via Worker and never returns the API key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/v1/contexts') && method === 'GET') {
        expect(headers.get('X-API-KEY')).toBe(FAKE_KEY);
        return new Response(
          JSON.stringify({
            data: { count: 1, results: [{ id: 'ctx-delivery-1', name: 'VARE delivery presenter' }] },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v1/contexts/') && method === 'PATCH') {
        expect(headers.get('X-API-KEY')).toBe(FAKE_KEY);
        const body = JSON.parse(String(init?.body)) as { opening_text?: string };
        expect(body.opening_text).toBe('');
        return new Response(JSON.stringify({ data: { id: 'ctx-delivery-1' } }), { status: 200 });
      }
      expect(url).toContain('https://api.liveavatar.com/v1/sessions/token');
      expect(headers.get('X-API-KEY')).toBe(FAKE_KEY);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.mode).toBe('FULL');
      expect(body.is_sandbox).toBe(true);
      expect(body.avatar_id).toBe(LIVEAVATAR_SANDBOX_AVATAR_ID);
      const persona = body.avatar_persona as {
        context_id?: string;
        language?: string;
        voice_settings?: { speed?: number };
      };
      expect(persona.context_id).toBe('ctx-delivery-1');
      expect(persona.language).toBe('en');
      expect(persona.voice_settings?.speed).toBe(1);
      return new Response(
        JSON.stringify({
          data: {
            session_id: 'sess-abc12345',
            session_token: 'eyJhbGciOi.fake.session.token',
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/session/start', { method: 'POST' }),
      env(),
      {} as ExecutionContext,
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain(FAKE_KEY);
    const json = JSON.parse(text) as {
      mode: string;
      session: {
        sessionId: string;
        sessionToken: string;
        sandbox: boolean;
        mode: string;
        voiceSpeed: number;
      };
    };
    expect(json.mode).toBe('Sandbox');
    expect(json.session.sessionId).toBe('sess-abc12345');
    expect(json.session.sessionToken).toBe('eyJhbGciOi.fake.session.token');
    expect(json.session.sandbox).toBe(true);
    expect(json.session.mode).toBe('FULL');
    expect(json.session.voiceSpeed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('applies speakingPace slightly_slow as voice_settings.speed 0.85', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/v1/contexts') && method === 'GET') {
        return new Response(
          JSON.stringify({
            data: { count: 1, results: [{ id: 'ctx-delivery-1', name: 'VARE delivery presenter' }] },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v1/contexts/') && method === 'PATCH') {
        return new Response(JSON.stringify({ data: { id: 'ctx-delivery-1' } }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const persona = body.avatar_persona as { voice_settings?: { speed?: number } };
      expect(persona.voice_settings?.speed).toBe(0.8);
      return new Response(
        JSON.stringify({
          data: {
            session_id: 'sess-slow',
            session_token: 'eyJhbGciOi.fake.slow.token',
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakingPace: 'slightly_slow' }),
      }),
      env(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { session: { voiceSpeed: number } };
    expect(json.session.voiceSpeed).toBe(0.8);
  });

  it('ends a session with Bearer token (mocked)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/v1/sessions');
      expect(init?.method).toBe('DELETE');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer short-lived-token');
      expect(headers.get('Authorization')).not.toContain(FAKE_KEY);
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: 'short-lived-token' }),
      }),
      env(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not start a session when disabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/session/start', { method: 'POST' }),
      env({ LIVEAVATAR_ENABLED: 'false' }),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not start a session when API key missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/session/start', { method: 'POST' }),
      env({ LIVEAVATAR_API_KEY: '' }),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
