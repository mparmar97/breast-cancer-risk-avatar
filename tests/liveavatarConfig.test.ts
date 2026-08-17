import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';
import { LIVEAVATAR_SANDBOX_AVATAR_ID } from '../worker/liveavatar/types';

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;

const FAKE_KEY = 'TEST_LIVEAVATAR_SECRET_DO_NOT_EXPOSE';

function env(partial: Partial<Env> = {}): Env {
  return {
    ASSETS: assets,
    LIVEAVATAR_ENABLED: 'true',
    LIVEAVATAR_SANDBOX: 'true',
    LIVEAVATAR_AVATAR_ID: LIVEAVATAR_SANDBOX_AVATAR_ID,
    ...partial,
  };
}

describe('LiveAvatar config API', () => {
  it('reports Sandbox defaults and configured:false without API key', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/config'),
      env(),
      {} as ExecutionContext,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.enabled).toBe(true);
    expect(body.sandbox).toBe(true);
    expect(body.mode).toBe('FULL');
    expect(body.configured).toBe(false);
    expect(body.missingReason).toBe('LIVEAVATAR_API_KEY missing');
    expect(body.ttsConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('reports configured:true when key present (without calling LiveAvatar)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(
      new Request('https://example.com/api/liveavatar/config'),
      env({ LIVEAVATAR_API_KEY: FAKE_KEY }),
      {} as ExecutionContext,
    );
    const body = (await response.json()) as Record<string, unknown>;
    vi.unstubAllGlobals();
    expect(body.configured).toBe(true);
    expect(body.sandbox).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it('includes liveAvatar public flags on /api/config-status without leaking the key', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/api/config-status'),
      env({ LIVEAVATAR_API_KEY: FAKE_KEY, GROQ_API_KEY: 'sk-groq-test' }),
      {} as ExecutionContext,
    );
    const text = await response.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain('sk-groq-test');
    const body = JSON.parse(text) as { liveAvatar: { sandbox: boolean; configured: boolean } };
    expect(body.liveAvatar.sandbox).toBe(true);
    expect(body.liveAvatar.configured).toBe(true);
  });
});
