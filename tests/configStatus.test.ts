import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

interface ConfigStatusBody {
  backendConnected: boolean;
  groqConfigured: boolean;
  groqModel: string;
  dynamicModeAvailable: boolean;
}

async function getConfigStatus(env: Env, fetchMock?: ReturnType<typeof vi.fn>): Promise<ConfigStatusBody> {
  if (fetchMock) vi.stubGlobal('fetch', fetchMock);
  const request = new Request('https://example.com/api/config-status');
  const response = await worker.fetch(request, env, {} as ExecutionContext);
  const body = (await response.json()) as ConfigStatusBody;
  if (fetchMock) vi.unstubAllGlobals();
  return body;
}

const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;

describe('GET /api/config-status', () => {
  it('reports groqConfigured: false and the default model when no key is set', async () => {
    const body = await getConfigStatus({ ASSETS: assets });
    expect(body.backendConnected).toBe(true);
    expect(body.groqConfigured).toBe(false);
    expect(body.dynamicModeAvailable).toBe(false);
    expect(body.groqModel).toBe('openai/gpt-oss-20b');
  });

  it('reports groqConfigured: true and dynamicModeAvailable: true when a key is set', async () => {
    const fetchMock = vi.fn();
    const body = await getConfigStatus({ ASSETS: assets, GROQ_API_KEY: 'sk-test' }, fetchMock);
    expect(body.groqConfigured).toBe(true);
    expect(body.dynamicModeAvailable).toBe(true);
    // Never makes a paid/provider request to verify the key.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the configured GROQ_MODEL when set', async () => {
    const body = await getConfigStatus({ ASSETS: assets, GROQ_API_KEY: 'sk-test', GROQ_MODEL: 'custom-model' });
    expect(body.groqModel).toBe('custom-model');
  });

  it('never includes the API key anywhere in the response body', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/api/config-status'),
      { ASSETS: assets, GROQ_API_KEY: 'sk-super-secret-value' },
      {} as ExecutionContext,
    );
    const text = await response.text();
    expect(text).not.toContain('sk-super-secret-value');
  });
});
