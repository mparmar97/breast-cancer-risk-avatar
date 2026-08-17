import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../worker/index';
import { LIVEAVATAR_SANDBOX_AVATAR_ID } from '../worker/liveavatar/types';

const FAKE_KEY = 'TEST_LIVEAVATAR_SECRET_DO_NOT_EXPOSE';
const assets = { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher;

/**
 * Security: the permanent LiveAvatar API key must never appear in API
 * responses or public config. Frontend-bundle scanning runs in a separate
 * frontend test that does not require Node types in the worker tsconfig.
 */
describe('LiveAvatar API key leakage (Worker responses)', () => {
  it('never returns the fake secret from config or session-start error paths', async () => {
    const env: Env = {
      ASSETS: assets,
      LIVEAVATAR_ENABLED: 'true',
      LIVEAVATAR_SANDBOX: 'true',
      LIVEAVATAR_AVATAR_ID: LIVEAVATAR_SANDBOX_AVATAR_ID,
      LIVEAVATAR_API_KEY: FAKE_KEY,
    };

    const configResponse = await worker.fetch(
      new Request('https://example.com/api/liveavatar/config'),
      env,
      {} as ExecutionContext,
    );
    const configText = await configResponse.text();
    expect(configText).not.toContain(FAKE_KEY);

    const statusResponse = await worker.fetch(
      new Request('https://example.com/api/config-status'),
      env,
      {} as ExecutionContext,
    );
    expect(await statusResponse.text()).not.toContain(FAKE_KEY);
  });
});
